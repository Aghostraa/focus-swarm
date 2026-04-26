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
} from '@focus-swarm/core';

const AXL_API = process.env.AXL_API_URL ?? 'http://127.0.0.1:9002';
const PEER_LIST_PATH = process.env.PEER_LIST_PATH ?? './infra/axl/peers.local.json';
const SESSION_ID = process.env.SESSION_ID ?? `s-${Date.now()}`;
const PRODUCT_BRIEF = process.env.PRODUCT_BRIEF ?? 'Generic product';
const TOTAL_TURNS = Number(process.env.TOTAL_TURNS ?? 12);
const TURN_INTERVAL_MS = Number(process.env.TURN_INTERVAL_MS ?? 2000);
const REPORTS_DIR = process.env.REPORTS_DIR ?? './infra/deploy/reports';

interface PeerEntry { tokenId: string; peerId: string; archetype?: string; }

function loadPeers(): PeerEntry[] {
  if (!fs.existsSync(PEER_LIST_PATH)) throw new Error(`peer list missing at ${PEER_LIST_PATH}`);
  return JSON.parse(fs.readFileSync(PEER_LIST_PATH, 'utf8'));
}

function nextSpeaker(peers: PeerEntry[], idx: number): PeerEntry {
  return peers[idx % peers.length];
}

async function generateProbe(turn: number, transcriptTail: TranscriptEntry[]): Promise<string> {
  if (turn === 0) {
    return `We are testing this product: ${PRODUCT_BRIEF}. Share your honest first reaction.`;
  }
  const tail = transcriptTail.slice(-4).map((t) => `${t.speaker.slice(0, 8)}: ${t.text}`).join('\n');
  const r = await chat([
    {
      role: 'system',
      content:
        'You are a focus-group moderator. Generate one concise probing question (one sentence) that pushes the discussion deeper. Build on the most recent comment. Avoid generic questions.',
    },
    { role: 'user', content: `Product: ${PRODUCT_BRIEF}\nRecent transcript:\n${tail}` },
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
        transcript.push({ speaker: msg.speaker, text: msg.text, ts: msg.ts });
        await logAppend(transcriptStream, msg).catch(() => {});
        console.log(`[moderator] heard ${msg.speaker.slice(0, 8)}: ${msg.text.slice(0, 100)}`);
      }
    },
    ac.signal,
  );

  for (let turn = 0; turn < TOTAL_TURNS; turn++) {
    const speaker = nextSpeaker(peers, turn);
    const probe = await generateProbe(turn, transcript);
    const turnMsg: SwarmMsg = {
      type: 'turn',
      sessionId: SESSION_ID,
      speaker: speaker.peerId,
      prompt: probe,
      transcriptTail: transcript.slice(-6),
    };
    console.log(`[moderator] turn ${turn} → ${speaker.archetype ?? speaker.tokenId} probe="${probe.slice(0, 60)}..."`);
    // Broadcast to all so observers (UI, harness, other personas as listeners) can follow context.
    await Promise.all(peers.map((p) => axl.send(p.peerId, turnMsg).catch(() => {})));
    // Wait for the speaker's utterance to arrive (or timeout).
    const before = transcript.length;
    const deadline = Date.now() + 30000;
    while (transcript.length === before && Date.now() < deadline) {
      await new Promise((s) => setTimeout(s, 200));
    }
    if (transcript.length === before) {
      console.warn(`[moderator] turn ${turn} timeout — speaker silent`);
    }
    await new Promise((s) => setTimeout(s, TURN_INTERVAL_MS));
  }

  const endMsg: SwarmMsg = { type: 'session-end', sessionId: SESSION_ID };
  await Promise.all(peers.map((p) => axl.send(p.peerId, endMsg).catch(() => {})));
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
