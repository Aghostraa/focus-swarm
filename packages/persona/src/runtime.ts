// Persona runtime. One process per persona, sits beside its own AXL node.
// Subscribes to /recv. On 'turn' message, generates a verified utterance via
// 0G Compute and broadcasts it to peers.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  AxlClient,
  pumpRecv,
  chat,
  kvSet,
  kvGet,
  logAppend,
  streamIdFromLabel,
  downloadDecrypted,
  type SwarmMsg,
  type TranscriptEntry,
} from '@focus-swarm/core';

interface PersonaSpec {
  archetype: string;
  targetMarket: string;
  cohortId: number;
  lifeStory: string;
  values: string[];
  traumas: string[];
  mediaDiet: string[];
  techLiteracy: string;
  communicationStyle: string;
  dialogueSamples?: string[];
}

interface PersonaState {
  mood: number;
  recentSentiment: string;
  turnsSpoken: number;
}

const TOKEN_ID = process.env.PERSONA_TOKEN_ID ?? 'unknown';
const AXL_API = process.env.AXL_API_URL ?? 'http://127.0.0.1:9002';
const PEER_LIST_PATH = process.env.PEER_LIST_PATH ?? './infra/axl/peers.local.json';
const ROOT_HASH = process.env.PERSONA_ROOT_HASH;
const KEY_PATH = process.env.PERSONA_KEY_PATH;

if (!ROOT_HASH || !KEY_PATH) {
  console.error('PERSONA_ROOT_HASH and PERSONA_KEY_PATH required');
  process.exit(1);
}

async function loadSpec(): Promise<PersonaSpec> {
  const key = fs.readFileSync(KEY_PATH!);
  const blob = await downloadDecrypted(ROOT_HASH!, key);
  return JSON.parse(blob.toString('utf-8')) as PersonaSpec;
}

function buildSystemPrompt(spec: PersonaSpec): string {
  const parts = [
    `You roleplay as a focus-group panelist. Stay strictly in character.`,
    `Archetype: ${spec.archetype}`,
    `Life story: ${spec.lifeStory}`,
    `Core values: ${spec.values.join(', ')}`,
    `Formative load-bearing experiences: ${spec.traumas.join('; ')}`,
    `Daily media diet: ${spec.mediaDiet.join(', ')}`,
    `Tech literacy: ${spec.techLiteracy}`,
    `Communication style: ${spec.communicationStyle}`,
  ];
  if (spec.dialogueSamples?.length) {
    parts.push(``, `Voice examples — this is how you actually talk:`);
    spec.dialogueSamples.forEach((s) => parts.push(`"${s}"`));
  }
  parts.push(``, `Reply in 1–3 sentences. Speak naturally, in first person. React from your own life and values, not as a neutral assistant. If asked about a product, lean into specific concerns shaped by your background.`);
  return parts.join('\n');
}

function loadPeerList(): { tokenId: string; peerId: string }[] {
  if (!fs.existsSync(PEER_LIST_PATH)) return [];
  return JSON.parse(fs.readFileSync(PEER_LIST_PATH, 'utf8'));
}

async function main() {
  const axl = new AxlClient(AXL_API);
  const myPub = await axl.myPubkey();
  console.log(`[persona ${TOKEN_ID}] axl=${AXL_API} pubkey=${myPub.slice(0, 12)}...`);

  const spec = await loadSpec();
  const systemPrompt = buildSystemPrompt(spec);
  const stateStream = streamIdFromLabel(`persona:${TOKEN_ID}:state`);
  const logStream = streamIdFromLabel(`persona:${TOKEN_ID}:log`);

  let state: PersonaState = (await kvGet<PersonaState>(stateStream, 'state')) ?? {
    mood: 0.5,
    recentSentiment: 'neutral',
    turnsSpoken: 0,
  };

  const ac = new AbortController();
  process.on('SIGINT', () => ac.abort());
  process.on('SIGTERM', () => ac.abort());

  const onMessage = async (msg: SwarmMsg, fromPeer: string) => {
    if (msg.type === 'turn' && msg.speaker === myPub) {
      const transcript = msg.transcriptTail
        .map((t: TranscriptEntry) => `[${t.speaker.slice(0, 8)}] ${t.text}`)
        .join('\n');
      const userPrompt = [
        msg.prompt,
        '',
        transcript ? `Recent discussion:\n${transcript}` : '',
        `Your current mood: ${state.recentSentiment} (${state.mood.toFixed(2)})`,
      ]
        .filter(Boolean)
        .join('\n');

      const r = await chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      if (!r.verified) {
        console.warn('[persona] reply not TeeML-verified — dropping');
        return;
      }
      await logAppend(logStream, { ts: Date.now(), turn: state.turnsSpoken, speaker: myPub, text: r.text });
      state = { ...state, turnsSpoken: state.turnsSpoken + 1 };
      await kvSet(stateStream, 'state', state);

      const peers = loadPeerList().filter((p) => p.peerId !== myPub);
      const utterance: SwarmMsg = {
        type: 'utterance',
        sessionId: msg.sessionId,
        speaker: myPub,
        text: r.text,
        ts: Date.now(),
      };
      await Promise.all(peers.map((p) => axl.send(p.peerId, utterance).catch(() => {})));
      console.log(`[persona ${TOKEN_ID}] spoke: ${r.text.slice(0, 80)}...`);
    } else if (msg.type === 'utterance' && msg.speaker !== myPub) {
      // Heard a peer. Cheap rule-based mood update — don't burn an inference call.
      const t = msg.text.toLowerCase();
      const positive = /(love|great|awesome|nice|good|exciting|cool)/.test(t);
      const negative = /(hate|terrible|bad|annoying|stupid|broken|confusing)/.test(t);
      if (positive) state.mood = Math.min(1, state.mood + 0.05);
      else if (negative) state.mood = Math.max(0, state.mood - 0.05);
      state.recentSentiment = positive ? 'energized' : negative ? 'wary' : state.recentSentiment;
      await kvSet(stateStream, 'state', state).catch(() => {});
    } else if (msg.type === 'observation') {
      // Remember harness pushed a product observation. Use as context next turn.
      await logAppend(logStream, { ts: msg.ts, observation: msg.content, source: msg.source });
    } else if (msg.type === 'session-end') {
      console.log(`[persona ${TOKEN_ID}] session ended`);
    }
    void fromPeer;
  };

  await pumpRecv(axl, onMessage, ac.signal);
}

main().catch((e) => {
  console.error('[persona] fatal', e);
  process.exit(1);
});
