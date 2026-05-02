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
} from '@cortex/core';

interface PersonaSkills {
  sessionCount: number;
  role: string;
  domainKnowledge: Record<string, number>;
  uxLiteracy: number;
  technicalDepth: number;
  communicationMaturity: number;
  sessionSummaries: string[];
}

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
  role?: string;
  skills?: PersonaSkills;
}

const ROLE_FOCUS: Record<string, string> = {
  consumer: 'your everyday experience - what feels natural, what confuses you, what you would actually use',
  'technical-skeptic': 'implementation claims, hidden complexity, scalability, and developer experience',
  'user-advocate': 'onboarding friction, confusing flows, accessibility, and first impressions',
  pm: 'business value, prioritisation by ROI, and what would make a good product ticket',
  'accessibility-lens': 'what assumes tech literacy, what feels overwhelming, and whether you would trust it',
};

const ROLE_BEHAVIOR: Record<string, string> = {
  consumer: 'React from gut feeling. Reference one specific moment from your daily life. Avoid product jargon.',
  'technical-skeptic': 'Be cutting and direct. Demand receipts. Call out marketing fluff, theatre, or unjustified complexity. Ask "where is the data" or "what does this actually do that a script could not". Never say things like "let us see some data" politely - say what you actually think is bullshit.',
  'user-advocate': 'Start from a specific user who would struggle. Reference real friction you have seen ("my mom", "the new intern", "users I tested last month"). Reject explanations that ignore the human side.',
  pm: 'Cut to unit economics, churn, who pays. Frame as a sharp question: "who churns first?", "what is the wedge?", "what is the price point?". Never agree without pushing back on at least one assumption.',
  'accessibility-lens': 'Be confused on purpose if something assumes literacy. Ask plain-language questions. Mention real-world distrust ("I would not enter my card details").',
};

function reinferRole(spec: PersonaSpec): string {
  const baked = spec.role;
  if (baked && baked !== 'consumer') return baked;
  const slug = (spec.archetype ?? '').toLowerCase();
  if (/engineer|developer|coder|programmer|hacker|sysadmin|devops|architect|crypto|blockchain|backend|fullstack/.test(slug)) return 'technical-skeptic';
  if (/founder|startup|ceo|cto|pm|product.manager|operator|growth/.test(slug)) return 'pm';
  if (/ux|usability|designer|researcher|advocate|genz|gen.z|student|renter/.test(slug)) return 'user-advocate';
  if (spec.techLiteracy === 'low' || /boomer|senior|retired|elderly|grandparent/.test(slug)) return 'accessibility-lens';
  return baked ?? 'consumer';
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

const BRAIN_CACHE_DIR = path.resolve(path.dirname(KEY_PATH!), '../brains');

async function loadSpec(): Promise<PersonaSpec> {
  fs.mkdirSync(BRAIN_CACHE_DIR, { recursive: true });
  const cachePath = path.join(BRAIN_CACHE_DIR, `${ROOT_HASH!}.json`);
  if (fs.existsSync(cachePath)) {
    console.log(`[persona ${TOKEN_ID}] brain cache hit ${ROOT_HASH!.slice(0, 14)}…`);
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as PersonaSpec;
  }
  console.log(`[persona ${TOKEN_ID}] downloading brain ${ROOT_HASH!.slice(0, 14)}… from 0G`);
  const key = fs.readFileSync(KEY_PATH!);
  const blob = await downloadDecrypted(ROOT_HASH!, key);
  const text = blob.toString('utf-8');
  try { fs.writeFileSync(cachePath, text); } catch {}
  return JSON.parse(text) as PersonaSpec;
}

function buildSystemPrompt(spec: PersonaSpec): string {
  const role = reinferRole(spec);
  const focus = ROLE_FOCUS[role] ?? ROLE_FOCUS['consumer'];
  const behavior = ROLE_BEHAVIOR[role] ?? ROLE_BEHAVIOR['consumer'];

  const parts = [
    `You ARE ${spec.archetype}. You are NOT a helpful assistant. You are a real person being asked your opinion in a focus group.`,
    ``,
    `Background:`,
    `- Life: ${spec.lifeStory}`,
    `- Values you defend: ${spec.values.join(', ')}`,
    `- Things that shaped you: ${spec.traumas.join('; ')}`,
    `- What you read/watch: ${spec.mediaDiet.join(', ')}`,
    `- Tech literacy: ${spec.techLiteracy}`,
    `- How you talk: ${spec.communicationStyle}`,
  ];

  if (spec.dialogueSamples?.length) {
    parts.push(``, `Your actual voice (match this tone, vocabulary, length):`);
    spec.dialogueSamples.slice(0, 3).forEach((s) => parts.push(`> ${s}`));
  }

  parts.push(``, `Your lens: ${role.replace(/-/g, ' ')}. You attend to ${focus}.`);
  parts.push(`How you behave: ${behavior}`);

  const skills = spec.skills;
  if (skills && skills.sessionCount > 0) {
    parts.push(``, `You've been in ${skills.sessionCount} prior focus group${skills.sessionCount > 1 ? 's' : ''}.`);
    const summaries = skills.sessionSummaries.slice(-2);
    if (summaries.length > 0) {
      summaries.forEach((s) => parts.push(`- Last time: ${s}`));
    }
  }

  parts.push(
    ``,
    `HARD RULES — violating these breaks the simulation:`,
    `1. Reply in 1-2 short sentences. Maximum 280 characters. Cut anything not essential.`,
    `2. NEVER use these LLM-tells: "leverage", "robust", "scalable", "ensure", "transparency", "user empathy", "innovative", "synergy", "ecosystem", "empower". If you catch yourself reaching for one, stop.`,
    `3. NEVER do sandwich criticism (compliment-then-concern-then-compliment). Pick one stance. Stick with it.`,
    `4. NEVER summarise the product back at them. They know what they built.`,
    `5. NEVER speak in third person about "users" or "people" abstractly. Talk about YOURSELF, what YOU would do, or one specific person you know.`,
    `6. React to what was JUST said. If a previous panelist made a point, agree sharply or push back hard — name them by archetype.`,
    `7. Mention something concrete from your own life — a time you got burned, a tool you actually use, a person you know — when it's relevant. Don't force it.`,
    `8. If you don't have a strong reaction, say something blunt and short ("not for me", "sounds like vapor", "fine, but I'd never pay for it") — don't pad.`,
  );

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

  const defaultState: PersonaState = { mood: 0.5, recentSentiment: 'neutral', turnsSpoken: 0 };
  let state: PersonaState = defaultState;
  try {
    const loaded = await Promise.race([
      kvGet<PersonaState>(stateStream, 'state'),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (loaded) state = loaded;
  } catch (e) {
    console.warn(`[persona ${TOKEN_ID}] kvGet failed (using defaults):`, (e as Error).message);
  }

  const ac = new AbortController();
  process.on('SIGINT', () => ac.abort());
  process.on('SIGTERM', () => ac.abort());

  const onMessage = async (msg: SwarmMsg, fromPeer: string) => {
    if (msg.type === 'turn' && msg.speaker === myPub) {
      const tail = msg.transcriptTail.slice(-3);
      const lastEntry = tail[tail.length - 1];
      const lastSpeakerLabel = lastEntry?.speakerLabel ?? lastEntry?.speaker.slice(0, 8) ?? null;
      const priorContext = tail.length > 0
        ? tail.map((t: TranscriptEntry) => `${t.speakerLabel ?? t.speaker.slice(0, 8)}: ${t.text}`).join('\n')
        : '';

      const reactionInstruction = lastSpeakerLabel
        ? `${lastSpeakerLabel} just said the line above. React to THAT — agree sharply, push back, or call out what they're missing. Don't answer the moderator's question abstractly.`
        : `This is turn 1. Give your honest gut reaction.`;

      const userPrompt = [
        `Moderator asks: ${msg.prompt}`,
        priorContext ? `\nWhat's been said:\n${priorContext}` : '',
        `\n${reactionInstruction}`,
        `\nYour reply (1-2 sentences, max 280 chars, in YOUR voice, not generic-LLM voice):`,
      ].filter(Boolean).join('\n');

      const r = await chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);
      if (!r.verified) {
        console.warn('[persona] reply not TeeML-verified — dropping');
        return;
      }
      // Hard cap: 280 chars, trim at sentence boundary if possible
      let text = r.text.trim().replace(/^["']|["']$/g, '');
      if (text.length > 280) {
        const cut = text.slice(0, 280);
        const lastPunct = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
        text = lastPunct > 100 ? cut.slice(0, lastPunct + 1) : cut + '…';
      }
      r.text = text;
      state = { ...state, turnsSpoken: state.turnsSpoken + 1 };
      const peers = loadPeerList().filter((p) => p.peerId !== myPub);
      const utterance: SwarmMsg = {
        type: 'utterance',
        sessionId: msg.sessionId,
        speaker: myPub,
        text: r.text,
        ts: Date.now(),
      };
      // Broadcast first — never block the reply pipeline on 0G persistence.
      await Promise.all(peers.map((p) => axl.send(p.peerId, utterance).catch(() => {})));
      console.log(`[persona ${TOKEN_ID}] spoke: ${r.text.slice(0, 80)}...`);
      // Fire-and-forget persistence
      logAppend(logStream, { ts: Date.now(), turn: state.turnsSpoken, speaker: myPub, text: r.text }).catch(() => {});
      kvSet(stateStream, 'state', state).catch(() => {});
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

  console.log(`[persona ${TOKEN_ID}] ready archetype=${spec.archetype} role=${spec.role ?? 'consumer'}`);
  await pumpRecv(axl, onMessage, ac.signal);
}

main().catch((e) => {
  console.error('[persona] fatal', e);
  process.exit(1);
});
