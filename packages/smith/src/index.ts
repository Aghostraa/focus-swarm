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
  getWallet,
  loadEd25519PubkeyHex,
} from '@focus-swarm/core';
import type { PersonaSpec, MintedPersona } from './types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../../..');
const ABI_PATH = path.join(REPO_ROOT, 'packages/contracts/abi.json');
const ADDRESSES_PATH = path.join(REPO_ROOT, 'infra/deploy/addresses.json');
const KEYS_DIR = path.join(REPO_ROOT, 'infra/axl/keys');

function loadAddresses(): { MintPersona: string | null; ENSParent: string } {
  if (!fs.existsSync(ADDRESSES_PATH)) throw new Error(`addresses.json missing at ${ADDRESSES_PATH}`);
  return JSON.parse(fs.readFileSync(ADDRESSES_PATH, 'utf8'));
}

const SYSTEM_PROMPT = `You generate plausible focus-group panelists for product research.
Output a single JSON object with fields:
- lifeStory: 2-4 sentences, formative experiences and current life context
- values: 4-6 short value tags (e.g. "frugality", "self-expression")
- traumas: 1-3 short emotional load-bearing events shaping their decisions
- mediaDiet: 4-6 platforms or sources they consume daily
- techLiteracy: one of "low", "medium", "high"
- communicationStyle: one phrase capturing how they talk

JSON only. No prose around it.`;

export async function generatePersona(targetMarket: string, archetype: string, cohortId: number): Promise<PersonaSpec> {
  const userPrompt = `Target market: ${targetMarket}\nArchetype slug: ${archetype}\nCohort: ${cohortId}\nReturn JSON.`;
  const r = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ]);
  if (!r.verified) throw new Error('persona generation not verified — refusing to proceed');
  const json = extractJson(r.text);
  if (!json) throw new Error('compute reply not parseable as JSON');
  return {
    archetype,
    targetMarket,
    cohortId,
    lifeStory: json.lifeStory ?? '',
    values: json.values ?? [],
    traumas: json.traumas ?? [],
    mediaDiet: json.mediaDiet ?? [],
    techLiteracy: json.techLiteracy ?? 'medium',
    communicationStyle: json.communicationStyle ?? '',
  };
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

export type { PersonaSpec, MintedPersona };
