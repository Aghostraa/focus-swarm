// 0G Storage wrapper. Encrypted upload/download + KV r/w + Log append/read.
// Verified against ../0g-doc/docs/developer-hub/building-on-0g/storage/sdk.md and
// node_modules/@0gfoundation/0g-ts-sdk/types/.

import { ethers } from 'ethers';
import {
  Indexer,
  MemData,
  Batcher,
  KvClient,
  StorageNode,
  getFlowContract,
} from '@0gfoundation/0g-ts-sdk';
import { RPC_URL, INDEXER_URL, KV_NODE_URL, PRIVATE_KEY } from './config.js';

export type RootHash = string;
export type StreamId = string;

export interface UploadResult {
  rootHash: RootHash;
  txHash: string;
  txSeq: number;
}

let _indexer: Indexer | null = null;
let _signer: ethers.Wallet | null = null;
let _kvClient: KvClient | null = null;

export function indexer(): Indexer {
  if (!_indexer) _indexer = new Indexer(INDEXER_URL);
  return _indexer;
}

export function signer(): ethers.Wallet {
  if (!_signer) {
    if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY missing — fund via https://faucet.0g.ai');
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    _signer = new ethers.Wallet(PRIVATE_KEY, provider);
  }
  return _signer;
}

export function kvClient(): KvClient {
  if (!_kvClient) _kvClient = new KvClient(KV_NODE_URL);
  return _kvClient;
}

/** Upload a Buffer encrypted with AES-256. Persona brains never go up plaintext. */
export async function uploadEncrypted(data: Buffer, key: Uint8Array): Promise<UploadResult> {
  if (key.length !== 32) throw new Error('AES-256 key must be 32 bytes');
  const mem = new MemData(data);
  const [tx, err] = await indexer().upload(mem, RPC_URL, signer(), {
    encryption: { type: 'aes256', key },
  });
  if (err) throw err;
  if ('rootHashes' in tx) throw new Error('fragmented upload not supported in this path');
  return { rootHash: tx.rootHash, txHash: tx.txHash, txSeq: tx.txSeq };
}

/** Plaintext upload — only for non-sensitive artifacts (e.g. session reports). */
export async function uploadPlain(data: Buffer): Promise<UploadResult> {
  const mem = new MemData(data);
  const [tx, err] = await indexer().upload(mem, RPC_URL, signer());
  if (err) throw err;
  if ('rootHashes' in tx) throw new Error('fragmented upload not supported in this path');
  return { rootHash: tx.rootHash, txHash: tx.txHash, txSeq: tx.txSeq };
}

/** Download + decrypt. Wrong key returns ciphertext silently per SDK contract — callers should hash-check. */
export async function downloadDecrypted(rootHash: RootHash, key: Uint8Array): Promise<Buffer> {
  const [blob, err] = await indexer().downloadToBlob(rootHash, {
    proof: true,
    decryption: { symmetricKey: key },
  });
  if (err) throw err;
  return Buffer.from(await blob.arrayBuffer());
}

export async function downloadPlain(rootHash: RootHash): Promise<Buffer> {
  const [blob, err] = await indexer().downloadToBlob(rootHash, { proof: true });
  if (err) throw err;
  return Buffer.from(await blob.arrayBuffer());
}

async function getFlow(): Promise<{ flow: ReturnType<typeof getFlowContract>; nodes: StorageNode[] }> {
  const [nodes, err] = await indexer().selectNodes(1);
  if (err || !nodes || nodes.length === 0) throw err ?? new Error('no storage nodes');
  const status = await nodes[0].getStatus();
  const flow = getFlowContract(status.networkIdentity.flowAddress, signer());
  return { flow, nodes };
}

/** KV write — version-1 stream. `streamId` must be 32-byte hex (0x-prefixed). */
export async function kvSet(streamId: StreamId, key: string, value: unknown): Promise<{ txHash: string; rootHash: string }> {
  const { flow, nodes } = await getFlow();
  const batcher = new Batcher(3, nodes, flow, RPC_URL);
  const keyBytes = new TextEncoder().encode(key);
  const valBytes = new TextEncoder().encode(JSON.stringify(value));
  batcher.streamDataBuilder.addStreamId(streamId);
  batcher.streamDataBuilder.set(streamId, keyBytes, valBytes);
  const [tx, err] = await batcher.exec();
  if (err) throw err;
  return tx;
}

/** KV read by key. Returns null if absent. */
export async function kvGet<T = unknown>(streamId: StreamId, key: string): Promise<T | null> {
  const keyBytes = new TextEncoder().encode(key);
  // SDK runtime accepts base64 string here even though .d.ts narrows to Bytes.
  const v = await kvClient().getValue(streamId, ethers.encodeBase64(keyBytes) as unknown as Uint8Array);
  if (!v) return null;
  // Value shape from SDK: { data: base64, version, ... }. Decode to text.
  const data = (v as { data?: string }).data;
  if (!data) return null;
  const decoded = Buffer.from(data, 'base64').toString('utf-8');
  try {
    return JSON.parse(decoded) as T;
  } catch {
    return decoded as unknown as T;
  }
}

/**
 * Append-style log: each entry is a uniquely-keyed KV write (timestamp + nonce).
 * 0G Storage doesn't have a native append log primitive — we model it on KV,
 * with a `head` pointer for ordering.
 */
export async function logAppend(streamId: StreamId, entry: unknown): Promise<string> {
  const head = (await kvGet<{ count: number }>(streamId, '__head')) ?? { count: 0 };
  const seq = head.count;
  const entryKey = `entry:${seq.toString().padStart(8, '0')}`;
  await kvSet(streamId, entryKey, { ts: Date.now(), seq, data: entry });
  await kvSet(streamId, '__head', { count: seq + 1 });
  return entryKey;
}

export async function logRead(streamId: StreamId, fromSeq = 0): Promise<unknown[]> {
  const head = await kvGet<{ count: number }>(streamId, '__head');
  if (!head) return [];
  const entries: unknown[] = [];
  for (let i = fromSeq; i < head.count; i++) {
    const e = await kvGet(streamId, `entry:${i.toString().padStart(8, '0')}`);
    if (e !== null) entries.push(e);
  }
  return entries;
}

/** Derive a deterministic 32-byte streamId from a label. */
export function streamIdFromLabel(label: string): StreamId {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(label));
  // Ensure 64 hex chars (32 bytes) with 0x prefix
  const hex = hash.slice(2).padStart(64, '0');
  return '0x' + hex;
}

export const _meta = { RPC_URL, INDEXER_URL, KV_NODE_URL };
