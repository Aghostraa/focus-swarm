// Smith — generate persona via 0G Compute, encrypt+upload to 0G Storage,
// mint ERC-7857, register ENS subname.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { ethers } from 'ethers';
import {
  chat,
  uploadEncrypted,
  downloadDecrypted,
  getWallet,
  loadEd25519PubkeyHex,
} from '@focus-swarm/core';
import type { PersonaSpec, MintedPersona, PersonaRole, PersonaSkills } from './types.js';
import { fetchGroundTruth, type GroundTruth } from './ground-truth.js';
import { kvSet, streamIdFromLabel } from '@focus-swarm/core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const ABI_PATH = path.join(REPO_ROOT, 'packages/contracts/abi.json');
const ADDRESSES_PATH = path.join(REPO_ROOT, 'infra/deploy/addresses.json');
const KEYS_DIR = path.join(REPO_ROOT, 'infra/axl/keys');

function loadAddresses(): { MintPersona: string | null; ENSParent: string } {
  if (!fs.existsSync(ADDRESSES_PATH)) throw new Error(`addresses.json missing at ${ADDRESSES_PATH}`);
  return JSON.parse(fs.readFileSync(ADDRESSES_PATH, 'utf8'));
}

function buildSystemPrompt(gt: GroundTruth): string {
  const { big5, wdFacts, seedPersona } = gt;

  let prompt = `You generate plausible focus-group panelists for product research.
Output a single JSON object with these fields:
- lifeStory: 2-4 sentences, formative experiences and current life context
- values: 4-6 short value tags (e.g. "frugality", "self-expression")
- traumas: 1-3 short emotional load-bearing events shaping their decisions
- mediaDiet: 4-6 platforms or sources they consume daily
- techLiteracy: one of "low", "medium", "high"
- communicationStyle: one phrase capturing how they talk (tone, verbal tics, style)
- dialogueSamples: array of 4 short utterances (1-2 sentences each) in this person's exact voice — realistic things they'd say when reviewing a product

JSON only. No prose around it.`;

  prompt += `\n\nPersonality anchors (Big 5, 0–1): openness=${big5.openness}, conscientiousness=${big5.conscientiousness}, extraversion=${big5.extraversion}, agreeableness=${big5.agreeableness}, neuroticism=${big5.neuroticism}. Let these shape lifeStory, communicationStyle, and dialogue tone.`;

  if (wdFacts.length) {
    prompt += `\n\nBehavioral ground truth (real-world facts to weave into backstory and values — use for specificity, not copy-paste):\n${wdFacts.map((f) => `- ${f}`).join('\n')}`;
  }

  if (seedPersona) {
    prompt += `\n\n--- EXAMPLE OUTPUT (different archetype, same format) ---\n${JSON.stringify({
      lifeStory: seedPersona.lifeStory,
      values: seedPersona.values,
      traumas: seedPersona.traumas,
      mediaDiet: seedPersona.mediaDiet,
      techLiteracy: seedPersona.techLiteracy,
      communicationStyle: seedPersona.communicationStyle,
      dialogueSamples: seedPersona.dialogueSamples ?? [],
    }, null, 2)}\n--- END EXAMPLE ---`;
  }

  return prompt;
}

function clamp01(v: number): number { return Math.min(1, Math.max(0, v)); }

function mergeDeltas(base: Record<string, number>, deltas: Record<string, number>): Record<string, number> {
  const out = { ...base };
  for (const [k, d] of Object.entries(deltas)) out[k] = clamp01((out[k] ?? 0) + d);
  return out;
}

function inferRole(archetype: string, spec: PersonaSpec): PersonaRole {
  const slug = archetype.toLowerCase();
  if (spec.techLiteracy === 'high' && /engineer|developer|coder|programmer|tech|software/.test(slug)) return 'technical-skeptic';
  if (/founder|startup|ceo|pm|product.manager/.test(slug)) return 'pm';
  if (spec.techLiteracy === 'low' && /boomer|senior|retired|older|parent/.test(slug)) return 'accessibility-lens';
  if (/ux|design|renter|urban|genz|gen.z|young|student/.test(slug)) return 'user-advocate';
  return 'consumer';
}

export async function generatePersona(targetMarket: string, archetype: string, cohortId: number): Promise<PersonaSpec> {
  const DEFAULT_GT: GroundTruth = { big5: { openness: 0.60, conscientiousness: 0.55, extraversion: 0.55, agreeableness: 0.58, neuroticism: 0.52 }, wdFacts: [], seedPersona: null };
  const gt = await fetchGroundTruth(archetype).catch(() => DEFAULT_GT);
  const systemPrompt = buildSystemPrompt(gt);
  const userPrompt = `Target market: ${targetMarket}\nArchetype slug: ${archetype}\nCohort: ${cohortId}\nReturn JSON.`;
  const r = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
  if (!r.verified) throw new Error('persona generation not verified — refusing to proceed');
  const json = extractJson(r.text);
  if (!json) throw new Error('compute reply not parseable as JSON');
  const spec: PersonaSpec = {
    archetype,
    targetMarket,
    cohortId,
    lifeStory: json.lifeStory ?? '',
    values: json.values ?? [],
    traumas: json.traumas ?? [],
    mediaDiet: json.mediaDiet ?? [],
    techLiteracy: json.techLiteracy ?? 'medium',
    communicationStyle: json.communicationStyle ?? '',
    wdFacts: gt.wdFacts.length ? gt.wdFacts : undefined,
    dialogueSamples: Array.isArray(json.dialogueSamples) ? json.dialogueSamples : undefined,
  };
  const role = inferRole(archetype, spec);
  spec.role = role;
  spec.skills = {
    sessionCount: 0,
    role,
    domainKnowledge: {},
    uxLiteracy: clamp01(gt.big5.openness * 0.6 + (spec.techLiteracy === 'high' ? 0.4 : 0)),
    technicalDepth: spec.techLiteracy === 'high' ? 0.7 : spec.techLiteracy === 'medium' ? 0.4 : 0.1,
    communicationMaturity: clamp01(gt.big5.conscientiousness * 0.5 + gt.big5.agreeableness * 0.3),
    sessionSummaries: [],
  };
  return spec;
}

function extractJson(s: string): any {
  const fenced = s.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fenced ? fenced[1] : s;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function genAxlKey(label: string): { pemPath: string; pubkey: string } {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const pemPath = path.join(KEYS_DIR, `${label}.pem`);
  if (!fs.existsSync(pemPath)) {
    execSync(`openssl genpkey -algorithm ed25519 -out "${pemPath}"`);
  }
  return { pemPath, pubkey: loadEd25519PubkeyHex(pemPath) };
}

async function registerEns(name: string, ownerAddr: string, records: Record<string, string>): Promise<void> {
  const url = process.env.ENS_GATEWAY_URL ?? 'http://localhost:8787';
  const res = await fetch(`${url}/set`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, addresses: { 60: ownerAddr }, texts: records }),
  });
  if (!res.ok) throw new Error(`ens-gateway ${res.status}: ${await res.text()}`);
}

export async function mintPersona(spec: PersonaSpec): Promise<MintedPersona> {
  const { MintPersona, ENSParent } = loadAddresses();
  if (!MintPersona) throw new Error('MintPersona address missing — run pnpm deploy:contracts');
  const ensParent = ENSParent ?? 'focusgroup.eth';

  const wallet = getWallet();
  const ownerAddr = await wallet.getAddress();

  const key = crypto.randomBytes(32);
  const blob = Buffer.from(JSON.stringify(spec));
  const { rootHash, txHash: storageTx } = await uploadEncrypted(blob, key);

  const slot = `${spec.archetype}-${Date.now().toString(36)}`;
  const { pubkey: axlPeerId } = genAxlKey(`persona-${slot}`);

  const abi = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8')) as ethers.InterfaceAbi;
  const contract = new ethers.Contract(MintPersona, abi, wallet);
  const metadataHash = ethers.keccak256(blob);
  const tx = await contract.mint(ownerAddr, rootHash, metadataHash);
  const receipt = await tx.wait();
  const evt = receipt.logs.map((l: any) => {
    try { return contract.interface.parseLog(l); } catch { return null; }
  }).find((p: any) => p?.name === 'PersonaMinted');
  if (!evt) throw new Error('PersonaMinted event missing');
  const tokenId = Number(evt.args.tokenId);

  const ensName = `${spec.archetype}.cohort-${spec.cohortId}.${ensParent}`;
  try {
    await registerEns(ensName, ownerAddr, {
      'agent.inft': `${MintPersona}:${tokenId}`,
      'agent.axl_peer': axlPeerId,
      'agent.archetype': spec.archetype,
      'agent.resume': `0g://${rootHash}`,
      'agent.target_market': spec.targetMarket,
      'agent.featured': 'false',
    });
  } catch (e) {
    console.warn('[smith] ens register failed (continuing):', (e as Error).message);
  }

  // Persist key alongside iNFT metadata for hackathon mint-only flow.
  const keyOut = path.join(KEYS_DIR, `persona-${tokenId}.aes`);
  fs.writeFileSync(keyOut, key);

  return {
    tokenId,
    rootHash,
    encryptionKeyHex: Buffer.from(key).toString('hex'),
    axlPeerId,
    ensName,
    txHash: tx.hash,
    storageTxHash: storageTx,
  };
}

export type { PersonaSpec, MintedPersona, PersonaRole, PersonaSkills };

export interface EvolveParams {
  tokenId: number;
  ensName: string;
  currentSpec: PersonaSpec;
  currentKey: Buffer;
  myUtterances: string[];
  reportThemes: string[];
  reportOpportunities: string[];
  productBrief: string;
}

export interface EvolveResult {
  newRootHash: string;
  updatedSkills: PersonaSkills;
}

const EVOLVE_SYS = `You are a skill evaluator for synthetic focus-group personas.
Given a persona's profile, their utterances from a session, and the session's synthesised insights, output JSON only. Schema:
{
  "sessionSummary": string,          // ≤100 words — what this persona contributed and learned
  "domainDeltas": Record<string,number>,  // domain → delta in [-0.1, 0.1], e.g. { "fintech": 0.05 }
  "uxLiteracyDelta": number,         // [-0.1, 0.1]
  "technicalDepthDelta": number,     // [-0.1, 0.1]
  "communicationMaturityDelta": number // [-0.1, 0.1]
}
Be conservative with deltas — one session moves scores by at most 0.05–0.08.`;

export async function evolvePersona(p: EvolveParams): Promise<EvolveResult | null> {
  const skills = p.currentSpec.skills;
  if (!skills) return null;

  const userPrompt = [
    `Persona: ${p.currentSpec.archetype} (${p.currentSpec.role ?? 'consumer'})`,
    `Life: ${p.currentSpec.lifeStory}`,
    `Session topic: ${p.productBrief}`,
    `Their utterances (${p.myUtterances.length}):`,
    ...p.myUtterances.slice(0, 10).map((u, i) => `[${i + 1}] ${u}`),
    `Session themes: ${p.reportThemes.join('; ')}`,
    `Opportunities surfaced: ${p.reportOpportunities.join('; ')}`,
  ].join('\n');

  let delta: any = null;
  try {
    const r = await chat([
      { role: 'system', content: EVOLVE_SYS },
      { role: 'user', content: userPrompt },
    ]);
    if (!r.verified) {
      console.warn(`[evolve] ${p.ensName} skill assessment not TeeML-verified — skipping`);
      return null;
    }
    delta = extractEvolutionJson(r.text);
  } catch (e) {
    console.warn(`[evolve] ${p.ensName} chat failed:`, (e as Error).message);
    return null;
  }

  if (!delta) {
    console.warn(`[evolve] ${p.ensName} delta JSON not parseable — skipping`);
    return null;
  }

  const updatedSkills: PersonaSkills = {
    sessionCount: skills.sessionCount + 1,
    role: skills.role,
    domainKnowledge: mergeDeltas(skills.domainKnowledge, delta.domainDeltas ?? {}),
    uxLiteracy: clamp01(skills.uxLiteracy + (delta.uxLiteracyDelta ?? 0)),
    technicalDepth: clamp01(skills.technicalDepth + (delta.technicalDepthDelta ?? 0)),
    communicationMaturity: clamp01(skills.communicationMaturity + (delta.communicationMaturityDelta ?? 0)),
    sessionSummaries: [...skills.sessionSummaries.slice(-4), delta.sessionSummary ?? ''],
  };

  const updatedSpec: PersonaSpec = { ...p.currentSpec, skills: updatedSkills };
  const blob = Buffer.from(JSON.stringify(updatedSpec));
  let newRootHash: string;
  try {
    const up = await uploadEncrypted(blob, p.currentKey);
    newRootHash = up.rootHash;
  } catch (e) {
    console.warn(`[evolve] ${p.ensName} re-upload failed:`, (e as Error).message);
    return null;
  }

  // Update ENS resume pointer
  try {
    const { ENSParent } = loadAddresses();
    await registerEns(p.ensName, await getWallet().getAddress(), {
      'agent.resume': `0g://${newRootHash}`,
      'agent.session_count': String(updatedSkills.sessionCount),
    });
  } catch (e) {
    console.warn(`[evolve] ${p.ensName} ENS update failed (non-fatal):`, (e as Error).message);
  }

  // Fast KV path for next spawn
  try {
    const streamId = streamIdFromLabel(`persona:${p.tokenId}:skills`);
    await kvSet(streamId, 'skills', updatedSkills);
  } catch (e) {
    console.warn(`[evolve] ${p.ensName} KV update failed (non-fatal):`, (e as Error).message);
  }

  console.log(`[evolve] ${p.ensName} session ${updatedSkills.sessionCount} — new brain: ${newRootHash.slice(0, 14)}…`);
  return { newRootHash, updatedSkills };
}

function extractEvolutionJson(s: string): any {
  const fenced = s.match(/```(?:json)?\s*([\s\S]+?)```/);
  const candidate = fenced ? fenced[1] : s;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

export interface AwakenResult {
  ensName: string;
  tokenId: number;
  archetype: string;
  targetMarket: string;
  applicationText: string;
  verified: boolean;
  rootHash: string;
  keyPath: string;
}

/**
 * Wake existing catalog personas whose target_market overlaps with `market`.
 * Each matching persona loads its brain from 0G Storage and generates a short
 * expression of interest in the proposed research (verified via TeeML).
 */
export async function awakenPersonas(market: string, brief: string, limit = 6): Promise<AwakenResult[]> {
  const gatewayUrl = process.env.ENS_GATEWAY_URL ?? 'http://localhost:8787';
  const res = await fetch(`${gatewayUrl}/personas?market=${encodeURIComponent(market)}`);
  if (!res.ok) throw new Error(`gateway ${res.status}: ${await res.text()}`);
  const catalog: any[] = await res.json();

  const candidates = catalog.slice(0, limit);
  const results: AwakenResult[] = [];

  for (const p of candidates) {
    const rootHash = (p['agent.resume'] ?? '').replace('0g://', '');
    const inft = p['agent.inft'] ?? '';
    const tokenId = Number(inft.split(':')[1] ?? 0);
    const keyPath = path.join(KEYS_DIR, `persona-${tokenId}.aes`);

    if (!rootHash || !fs.existsSync(keyPath)) {
      console.warn(`[awaken] skipping ${p.name} — key or rootHash missing`);
      continue;
    }

    let spec: PersonaSpec | null = null;
    try {
      const key = fs.readFileSync(keyPath);
      const blob = await downloadDecrypted(rootHash, key);
      spec = JSON.parse(blob.toString());
    } catch (e) {
      console.warn(`[awaken] ${p.name} brain load failed:`, (e as Error).message);
      continue;
    }

    const systemPrompt = `You are ${spec!.archetype}. ${spec!.lifeStory}
Your values: ${spec!.values.join(', ')}. Communication style: ${spec!.communicationStyle}.
In one or two sentences, in your own voice, say whether you'd be interested in participating in focus group research on this topic, and why or why not.`;

    let applicationText = '';
    let verified = false;
    try {
      const r = await chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Research topic: "${brief}"\nTarget market: "${market}"` },
      ]);
      applicationText = r.text.slice(0, 300);
      verified = r.verified;
    } catch (e) {
      console.warn(`[awaken] ${p.name} chat failed:`, (e as Error).message);
      continue;
    }

    results.push({
      ensName: p.name,
      tokenId,
      archetype: p['agent.archetype'] ?? '',
      targetMarket: p['agent.target_market'] ?? '',
      applicationText,
      verified,
      rootHash,
      keyPath,
    });
  }

  return results;
}
