// Moderator: drives turn order, broadcasts prompts, collects transcript.
// Lives on its own AXL node; talks to persona nodes by their pubkeys.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  AxlClient,
  pumpRecv,
  chat,
  uploadPlain,
  logAppend,
  streamIdFromLabel,
  type SwarmMsg,
  type TranscriptEntry,
} from '@cortex/core';

const AXL_API = process.env.AXL_API_URL ?? 'http://127.0.0.1:9002';
const PEER_LIST_PATH = process.env.PEER_LIST_PATH ?? './infra/axl/peers.local.json';
const SESSION_ID = process.env.SESSION_ID ?? `s-${Date.now()}`;
const PRODUCT_BRIEF = process.env.PRODUCT_BRIEF ?? 'Generic product';
const TOTAL_TURNS = Number(process.env.TOTAL_TURNS ?? 12);
const TURN_INTERVAL_MS = Number(process.env.TURN_INTERVAL_MS ?? 2000);
const REPORTS_DIR = process.env.REPORTS_DIR ?? './infra/deploy/reports';
const RESEARCH_GOALS: string[] = process.env.RESEARCH_GOALS ? JSON.parse(process.env.RESEARCH_GOALS) : [];
const MODERATION_STYLE: 'breadth' | 'deep-dive' | 'conflict-seeking' =
  (process.env.MODERATION_STYLE as any) ?? 'breadth';
const EVENTS_PATH = process.env.SESSION_EVENTS_PATH ?? null;
const PERSONA_MAP: Record<string, { archetype: string; role: string; ensName: string }> =
  process.env.PERSONA_MAP ? JSON.parse(process.env.PERSONA_MAP) : {};

function emitEvent(event: object): void {
  if (!EVENTS_PATH) return;
  try { fs.appendFileSync(EVENTS_PATH, JSON.stringify(event) + '\n'); } catch {}
}

interface PeerEntry { tokenId: string; peerId: string; archetype?: string; }

function loadPeers(): PeerEntry[] {
  if (!fs.existsSync(PEER_LIST_PATH)) throw new Error(`peer list missing at ${PEER_LIST_PATH}`);
  return JSON.parse(fs.readFileSync(PEER_LIST_PATH, 'utf8'));
}

function nextSpeaker(peers: PeerEntry[], idx: number): PeerEntry {
  return peers[idx % peers.length];
}

function moderatorSystemPrompt(): string {
  const styleInstructions: Record<typeof MODERATION_STYLE, string> = {
    'breadth': 'Cover diverse angles — emotional, practical, social, financial. Move to a new angle each turn.',
    'deep-dive': 'Follow threads relentlessly. Ask "why" and "tell me more" variations. Stay on the richest thread until exhausted.',
    'conflict-seeking': 'Surface disagreements. Ask participants to react to each other\'s points directly. Push back on consensus.',
  };
  let prompt = `You are a focus-group moderator. Generate one concise probing question (one sentence) that pushes the discussion deeper. Build on the most recent comment. Avoid generic questions.\n\nStyle: ${styleInstructions[MODERATION_STYLE]}`;
  if (RESEARCH_GOALS.length) {
    prompt += `\n\nResearch goals to keep in mind:\n${RESEARCH_GOALS.map((g) => `- ${g}`).join('\n')}`;
  }
  return prompt;
}

async function generateProbe(round: number, transcriptTail: TranscriptEntry[]): Promise<string> {
  if (round === 0) {
    const goalHint = RESEARCH_GOALS.length ? ` We're especially interested in: ${RESEARCH_GOALS[0]}.` : '';
    return `We are testing this product:\n\n${PRODUCT_BRIEF}\n\n${goalHint} Share your honest first reaction — pick the ONE thing that grabbed you (or annoyed you) most.`;
  }
  const tail = transcriptTail.slice(-8).map((t) => {
    const meta = PERSONA_MAP[t.speaker];
    const label = meta ? `${meta.archetype} (${meta.role})` : t.speaker.slice(0, 8);
    return `${label}: ${t.text}`;
  }).join('\n');
  const r = await chat([
    { role: 'system', content: moderatorSystemPrompt() },
    { role: 'user', content: `Product: ${PRODUCT_BRIEF}\n\nWhat the panel just said:\n${tail}\n\nWrite ONE follow-up question that pushes the discussion deeper. Surface a tension or unresolved point from the transcript above. Do NOT invent participant names — refer to them only by their archetype label. Keep it under 25 words.` },
  ]);
  return r.text.replace(/^"|"$/g, '').slice(0, 300);
}

async function main() {
  const axl = new AxlClient(AXL_API);
  const myPub = await axl.myPubkey();
  console.log(`[moderator] axl=${AXL_API} session=${SESSION_ID} pub=${myPub.slice(0, 12)}...`);

  const peers = loadPeers().filter((p) => p.peerId !== myPub);
  if (peers.length === 0) throw new Error('no persona peers found');
  console.log(`[moderator] ${peers.length} personas`);

  const transcript: TranscriptEntry[] = [];
  const transcriptStream = streamIdFromLabel(`session:${SESSION_ID}:transcript`);

  const ac = new AbortController();
  const recvPromise = pumpRecv(
    axl,
    async (msg: SwarmMsg) => {
      if (msg.type === 'utterance') {
        const meta = PERSONA_MAP[msg.speaker];
        const speakerLabel = meta ? `${meta.archetype} (${meta.role})` : msg.speaker.slice(0, 8);
        transcript.push({ speaker: msg.speaker, text: msg.text, ts: msg.ts, speakerLabel });
        // Fire-and-forget — never block pumpRecv on slow 0G KV writes
        logAppend(transcriptStream, msg).catch(() => {});
        emitEvent({ type: 'utterance', speaker: msg.speaker, archetype: meta?.archetype ?? msg.speaker.slice(0, 8), role: meta?.role ?? 'consumer', ensName: meta?.ensName ?? '', text: msg.text, ts: msg.ts });
        console.log(`[moderator] heard ${msg.speaker.slice(0, 8)}: ${msg.text.slice(0, 100)}`);
      }
    },
    ac.signal,
  );

  // Parallel rounds: each round, moderator asks one probe and ALL personas respond simultaneously.
  // TOTAL_TURNS is reinterpreted as total target utterances; rounds = ceil(TOTAL_TURNS / peers.length).
  const TOTAL_ROUNDS = Math.max(1, Math.ceil(TOTAL_TURNS / peers.length));
  console.log(`[moderator] ${TOTAL_ROUNDS} parallel rounds × ${peers.length} personas = ${TOTAL_ROUNDS * peers.length} max utterances`);

  for (let round = 0; round < TOTAL_ROUNDS; round++) {
    const probe = await generateProbe(round, transcript);
    console.log(`[moderator] round ${round} probe="${probe.slice(0, 80)}..."`);

    // Emit thinking events for all personas at once
    for (const p of peers) {
      const meta = PERSONA_MAP[p.peerId];
      emitEvent({ type: 'thinking', speaker: p.peerId, archetype: meta?.archetype ?? p.tokenId, role: meta?.role ?? 'consumer', probe, turn: round, ts: Date.now() });
    }

    // Snapshot transcript length BEFORE sending — personas that respond during stagger must count.
    const before = transcript.length;

    // Address each persona individually with a 7s stagger to avoid 0G Compute rate limit bursts.
    // 0G Compute allows 10 req/min; staggering ensures requests spread across the window.
    const transcriptTail = transcript.slice(-8);
    for (let pi = 0; pi < peers.length; pi++) {
      const p = peers[pi];
      if (pi > 0) await new Promise((s) => setTimeout(s, 7000));
      axl.send(p.peerId, {
        type: 'turn',
        sessionId: SESSION_ID,
        speaker: p.peerId,
        prompt: probe,
        transcriptTail,
      } as SwarmMsg).catch(() => {});
    }
    // Wait for minReplies. Deadline accounts for stagger (7*(N-1)s) + 90s compute budget.
    const minReplies = Math.max(1, Math.ceil(peers.length / 2));
    const deadline = Date.now() + 7000 * (peers.length - 1) + 90000;
    while (transcript.length - before < minReplies && Date.now() < deadline) {
      await new Promise((s) => setTimeout(s, 250));
    }
    // Grace period for remaining stragglers — up to 30s after minReplies reached
    const graceUntil = Date.now() + 30000;
    const expected = before + peers.length;
    while (transcript.length < expected && Date.now() < graceUntil) {
      await new Promise((s) => setTimeout(s, 250));
    }
    const replied = transcript.length - before;
    if (replied < peers.length) {
      const silent = peers.length - replied;
      console.warn(`[moderator] round ${round}: ${silent}/${peers.length} silent`);
      emitEvent({ type: 'timeout', speaker: 'multiple', turn: round, ts: Date.now() });
    }
  }

  const endMsg: SwarmMsg = { type: 'session-end', sessionId: SESSION_ID };
  await Promise.all(peers.map((p) => axl.send(p.peerId, endMsg).catch(() => {})));
  emitEvent({ type: 'session-end', ts: Date.now() });
  ac.abort();
  await recvPromise;

  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const transcriptJson = JSON.stringify({ sessionId: SESSION_ID, productBrief: PRODUCT_BRIEF, transcript }, null, 2);
  const local = path.join(REPORTS_DIR, `${SESSION_ID}.transcript.json`);
  fs.writeFileSync(local, transcriptJson);
  const up = await uploadPlain(Buffer.from(transcriptJson)).catch((e) => {
    console.warn('[moderator] transcript upload failed:', (e as Error).message);
    return null;
  });
  console.log(`[moderator] done. local=${local} 0g=${up?.rootHash ?? 'n/a'}`);
}

main().catch((e) => {
  console.error('[moderator] fatal', e);
  process.exit(1);
});
