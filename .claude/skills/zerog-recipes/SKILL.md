---
name: zerog-recipes
description: Verified-working 0G Storage and 0G Compute snippets. Use when implementing any 0G SDK call. Triggers on "0g storage how", "0g compute how", "verifiable inference snippet", "kv read", "kv write", "encrypted upload".
---

# zerog-recipes

Copy-paste recipes for `@0gfoundation/0g-ts-sdk` (storage) and `@0glabs/0g-serving-broker` (compute). All snippets target testnet Galileo (chain 16602).

## Network constants
```ts
export const RPC_URL = 'https://evmrpc-testnet.0g.ai';
export const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai';
export const KV_NODE_URL = 'http://3.101.147.150:6789';
export const CHAIN_ID = 16602;
```

## Storage: encrypted upload (AES-256)
```ts
import { ZgFile, Indexer } from '@0gfoundation/0g-ts-sdk';
import { ethers } from 'ethers';
import crypto from 'node:crypto';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const indexer = new Indexer(INDEXER_URL);

const key = crypto.randomBytes(32);
const file = await ZgFile.fromFilePath('./brain.json'); // or ZgFile.fromBuffer
const [tx, err] = await indexer.upload(file, RPC_URL, signer, {
  encryption: { type: 'aes256', key }
});
if (err) throw err;
const rootHash = tx.rootHash;
```

## Storage: encrypted download
```ts
const [blob, err] = await indexer.downloadToBlob(rootHash, {
  decryption: { key }
});
```

## Storage: KV write
```ts
import { Batcher } from '@0gfoundation/0g-ts-sdk';

const [nodes, err1] = await indexer.selectNodes(1);
const batcher = new Batcher(1, nodes, flowContract, RPC_URL);
batcher.streamDataBuilder.set(
  streamId,
  Uint8Array.from(Buffer.from(key, 'utf-8')),
  Uint8Array.from(Buffer.from(JSON.stringify(value), 'utf-8'))
);
const [tx, err2] = await batcher.exec();
```

## Storage: KV read
```ts
import { KvClient } from '@0gfoundation/0g-ts-sdk';
const kv = new KvClient(KV_NODE_URL);
const v = await kv.getValue(streamId, ethers.encodeBase64(keyBytes));
```

## Compute: broker init + verified chat
```ts
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';

const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!,
  new ethers.JsonRpcProvider(RPC_URL));
const broker = await createZGComputeNetworkBroker(wallet);

// One-time funding
await broker.ledger.depositFund(10);
await broker.ledger.transferFund(providerAddress, 'inference',
  BigInt(1) * BigInt(10**18));

// Find Qwen 2.5 7B testnet provider
const services = await broker.inference.listService();
const qwen = services.find(s => s.model === 'qwen-2.5-7b-instruct');
if (!qwen) throw new Error('Qwen unavailable');

const { endpoint, model } = await broker.inference.getServiceMetadata(qwen.provider);
const headers = await broker.inference.getRequestHeaders(qwen.provider);

const res = await fetch(`${endpoint}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })
});
const data = await res.json();
const chatID = res.headers.get('ZG-Res-Key') || data.id;
const verified = await broker.inference.processResponse(qwen.provider, chatID);
if (!verified) throw new Error('TeeML verification failed');
```

## Doc references
- Storage SDK: `../0g-doc/docs/developer-hub/building-on-0g/storage/sdk.md:225-420`
- Compute SDK: `../0g-doc/docs/developer-hub/building-on-0g/compute-network/inference.md:466-940`
- Testnet config: `../0g-doc/docs/developer-hub/building-on-0g/testnet/testnet-overview.md`

## Watch out
- Mainnet has more models (DeepSeek V3, GLM-5-FP8); testnet only ships Qwen 2.5 7B + Qwen Image Edit.
- Rate limit: 30 req/min, 5 concurrent. Stagger if N personas > 5.
- `processResponse` is async; never skip it — verifiability is the whole point of using 0G Compute.
- Indexer URL has trailing-slash sensitivity in some versions; use exactly as shown.
