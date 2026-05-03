# @cortex/core

Raw wrappers over 0G Storage, 0G Compute, 0G KV, and the AXL HTTP bridge. No agent logic here — that lives in `@cortex/kit`.

**Package:** `packages/core/`  
**Smoke tests:** `pnpm -F @cortex/core smoke:storage` and `smoke:compute`

---

## Config (`src/config.ts`)

Loaded automatically by importing any `@cortex/core` module. Reads `.env` at repo root.

```typescript
import { RPC_URL, INDEXER_URL, KV_NODE_URL, PRIVATE_KEY, COMPUTE_MODEL } from '@cortex/core';
```

| Export | Env var | Default |
|--------|---------|---------|
| `RPC_URL` | `ZG_RPC_URL` | `https://evmrpc-testnet.0g.ai` |
| `INDEXER_URL` | `ZG_INDEXER_URL` | `https://indexer-storage-testnet-turbo.0g.ai` |
| `KV_NODE_URL` | `ZG_KV_NODE_URL` | `http://3.101.147.150:6789` |
| `CHAIN_ID` | `ZG_CHAIN_ID` | `16602` |
| `PRIVATE_KEY` | `PRIVATE_KEY` | `""` — required |
| `COMPUTE_MODEL` | `ZG_COMPUTE_MODEL` | `qwen/qwen-2.5-7b-instruct` |

---

## Storage (`src/storage.ts`)

All persona brains must be encrypted before upload. `uploadPlain` is for non-sensitive artifacts (session reports, etc.).

```typescript
import { uploadEncrypted, downloadDecrypted, uploadPlain, kvSet, kvGet, logAppend, logRead } from '@cortex/core';
```

### `uploadEncrypted(data: Buffer, key: Uint8Array): Promise<UploadResult>`

AES-256 encrypt then upload to 0G Storage.

```typescript
const key = crypto.randomBytes(32);  // or derive deterministically
const result = await uploadEncrypted(Buffer.from(JSON.stringify(brain)), key);
// result.rootHash — store in ENS agent.resume
// result.txHash   — on-chain transaction
// result.txSeq    — storage sequence number (for explorer links)
```

**Invariant:** `key` must be exactly 32 bytes. Throws otherwise.

### `downloadDecrypted(rootHash: string, key: Uint8Array): Promise<Buffer>`

```typescript
const buf = await downloadDecrypted('0xabcd...', key);
const brain = JSON.parse(buf.toString('utf-8'));
```

### `uploadPlain(data: Buffer): Promise<UploadResult>`

Use only for non-sensitive data (reports, manifests).

### `kvSet(streamId, key, value): Promise<{ txHash, rootHash }>`

Write to a 0G KV stream. Uses `Batcher` + `getFlowContract`.

```typescript
import { streamIdFromLabel, kvSet, kvGet } from '@cortex/core';

const streamId = streamIdFromLabel('persistent-agent:my-agent:state');
await kvSet(streamId, 'profile', { summary: '...', skills: [...] });
const profile = await kvGet<Profile>(streamId, 'profile');
```

### `logAppend(streamId, entry): Promise<string>`

Append-style log modeled on KV. Maintains a `__head` counter. Returns entry key.

```typescript
await logAppend(streamId, {
  task: 'draft_cover_letter',
  outcome: 'worked',
  protocol: 'apply',
});
```

### `logRead(streamId, fromSeq?): Promise<unknown[]>`

Read all entries from a sequence.

```typescript
const events = await logRead(streamId, 0);
```

### `streamIdFromLabel(label: string): string`

Derive a deterministic 32-byte hex stream ID.

```typescript
const id = streamIdFromLabel('persistent-agent:zerog-builder:episodic');
// '0x3f2a...' (32 bytes, always the same for this label)
```

---

## Compute (`src/compute.ts`)

All inference goes through this. Uses `@0glabs/0g-serving-broker` via CJS require (avoids ESM static-link issue on Node 22).

```typescript
import { chat, ensureFunded, getBroker, findProvider } from '@cortex/core';
```

### `chat(messages: ChatMsg[], model?: string): Promise<ChatResult>`

Call 0G Compute with TeeML verification. Retries 4× with exponential backoff on 429.

```typescript
const result = await chat([
  { role: 'system', content: 'You are a 0G expert.' },
  { role: 'user', content: 'How does 0G KV work?' },
]);

if (!result.verified) {
  // TeeML did not verify — treat as unverified
}
console.log(result.text);      // model output
console.log(result.verified);  // true if TeeML proof passed
console.log(result.provider);  // provider address
console.log(result.model);     // model used
```

**Do not call OpenAI or Anthropic from agent code. Always use `chat()` or `verifiedReason()` from `@cortex/kit`.**

### `ensureFunded(amount?, providerAddr?): Promise<void>`

Create/top-up ledger before inference. Safe to call multiple times (idempotent).

```typescript
await ensureFunded(3);  // 3 0G tokens
```

### `findProvider(model): Promise<{ provider, endpoint, model }>`

Select a provider that supports the requested model. Caches results.

---

## AXL Client (`src/axl.ts`)

HTTP client for the local AXL node bridge. Each agent process connects to its own node.

```typescript
import { AxlClient, pumpRecv } from '@cortex/core';

const axl = new AxlClient('http://127.0.0.1:9002');
```

### `axl.myPubkey(): Promise<string>`

Get this node's Yggdrasil public key. Use as the `agent.axl_peer` ENS text record.

### `axl.send(peerId: string, payload: unknown): Promise<void>`

Send a message to another peer. Payload is JSON-serialized.

```typescript
await axl.send(remotePeerId, {
  type: 'peer_query',
  projectId: 'proj-123',
  from: 'zerog-builder',
  question: 'How should I store state?',
  requestId: 'rq-abc',
});
```

### `axl.recv(): Promise<{ from: string; body: string } | null>`

Long-poll for one message. Returns `null` on 204 (queue empty).

### `pumpRecv(axl, onMessage, signal): Promise<void>`

Continuous receive loop until `signal` is aborted.

```typescript
const ac = new AbortController();
process.on('SIGTERM', () => ac.abort());

await pumpRecv(axl, async (msg, fromPeer) => {
  if (msg.type === 'peer_query') {
    const answer = await verifiedReason([...]);
    await axl.send(fromPeer, { type: 'peer_answer', ... });
  }
}, ac.signal);
```

### SwarmMsg types

All message types used in Cortex:

| type | Description |
|------|-------------|
| `turn` | Moderator → persona: your turn to speak |
| `utterance` | Persona → all: I said this |
| `observation` | Harness → all: here's product content |
| `session-end` | Moderator → all: session over |
| `query` | Agent → agent: answer this question |
| `answer` | Response to `query` |
| `project_brief` | Coordinator → all: here's the project |
| `capability_response` | Agent → coordinator: here's my role |
| `peer_query` | Twin → twin: what do you think about X? |
| `peer_answer` | Twin → twin: response to peer_query |
| `skill_evolved` | Twin → all: I updated my skill |

---

## Identity (`src/iden.ts`)

```typescript
import { loadEd25519PubkeyHex, getWallet } from '@cortex/core';

// Extract ed25519 public key from PEM file (used for AXL nodes)
const pubkeyHex = loadEd25519PubkeyHex('infra/axl/keys/node-0.pem');

// Get secp256k1 wallet for EVM signing
const wallet = getWallet();  // uses PRIVATE_KEY env
```
