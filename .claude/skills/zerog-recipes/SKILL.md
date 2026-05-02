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

## Storage: KV write (with replication)
```ts
import { Batcher } from '@0gfoundation/0g-ts-sdk';

const [nodes, err1] = await indexer.selectNodes(1);
// Replicate to 3 nodes for peer discovery + resilience
const batcher = new Batcher(3, nodes, flowContract, RPC_URL);
batcher.streamDataBuilder.addStreamId(streamId);
const keyBytes = new TextEncoder().encode(key);
const valBytes = new TextEncoder().encode(JSON.stringify(value));
batcher.streamDataBuilder.set(streamId, keyBytes, valBytes);
const [tx, err2] = await batcher.exec();
if (err2) throw err2;
// Returns { txHash, rootHash } — rootHash is the new transaction hash
```

## Storage: KV read (with fallback)
```ts
import { KvClient } from '@0gfoundation/0g-ts-sdk';

// Use local zgs_kv node if available, else public node
const kvUrl = process.env.ZG_KV_NODE_URL ?? 'http://3.101.147.150:6789';
const kv = new KvClient(kvUrl);

try {
  const keyBytes = new TextEncoder().encode(key);
  // Note: KvClient.getValue expects base64-encoded key
  const v = await Promise.race([
    kv.getValue(streamId, ethers.encodeBase64(keyBytes)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('KV read timeout')), 5000))
  ]);
  return v;
} catch (e) {
  console.warn(`KV read failed: ${e.message}`);
  return null; // Graceful fallback
}
```

## Storage: Stream ID format (critical)
Stream IDs must be **exactly 64 hex characters (32 bytes)** for zgs_kv compatibility.

```ts
import { ethers } from 'ethers';

function streamIdFromLabel(label: string): string {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(label));
  // Remove 0x prefix, ensure 64 chars via padStart
  const hex = hash.slice(2).padStart(64, '0');
  return '0x' + hex; // Return with 0x prefix for SDK
}

// Example: "persistent-agent:apply-twin:state"
// → 0xe78d4fc6ba887789d36f7b93ed2b6e46ffd8b8d4b0e6d45f6de2080d2e9be782
```

Use in code:
```ts
const streamId = streamIdFromLabel('persistent-agent:apply-twin:state');
const [ = await indexer.selectNodes(1);
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

## Local KV node setup (zgs_kv)

For full local control (no public KV dependency), run zgs_kv locally:

```bash
# 1. Clone + build (one-time, takes 5-10 min)
git clone https://github.com/0gfoundation/0g-storage-kv.git ~/0g-storage-kv
cd ~/0g-storage-kv
cargo build --release  # Requires cmake >= 3.5, protoc binary

# 2. Write config
mkdir -p run
cat > run/config.toml << 'EOF'
stream_ids = ["e78d4fc6ba887789d36f7b93ed2b6e46ffd8b8d4b0e6d45f6de2080d2e9be782"]
db_dir = "db"
kv_db_dir = "kv.DB"
blockchain_rpc_endpoint = "https://evmrpc-testnet.0g.ai"
log_contract_address = "0x1F1b949A36CFF78F3A32F0dBB4FF72D1eE55e5eE"
log_sync_start_block_number = 0
rpc_enabled = true
rpc_listen_address = "0.0.0.0:6789"
zgs_node_urls = "http://34.83.53.209:5678,http://34.169.28.106:5678"
log_config_file = "log_config"
EOF

# 3. Run
cd run
../target/release/zgs_kv --config config.toml
```

Then set in your `.env.local`:
```bash
ZG_KV_NODE_URL=http://127.0.0.1:6789
```

**Gotchas:**
- Stream IDs in `config.toml` must be 64 hex chars **without** 0x prefix
- CMake version issue: if you get "Compatibility with CMake < 3.5 has been removed", install protoc: `brew install protobuf` (macOS) or `apt-get install protobuf-compiler` (Linux)
- Rebuild will take 1-2 min with all deps cached

## Config override pattern

Always check `.env.local` before `.env` for development:

```ts
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

const root = '.';
loadDotenv({ path: resolve(root, '.env') });
loadDotenv({ path: resolve(root, '.env.local'), override: true });

// Now process.env.ZG_KV_NODE_URL reads from .env.local if present
```

This lets developers run local zgs_kv without modifying committed `.env`.

## Watch out
- Mainnet has more models (DeepSeek V3, GLM-5-FP8); testnet only ships Qwen 2.5 7B + Qwen Image Edit.
- Rate limit: 30 req/min, 5 concurrent. Stagger if N personas > 5.
- `processResponse` is async; never skip it — verifiability is the whole point of using 0G Compute.
- Indexer URL has trailing-slash sensitivity in some versions; use exactly as shown.
- **KV read timeout is common** — 30s default is generous. Use local zgs_kv or increase timeout + add retry.
- **Stream ID padding**: keccak256 can produce 63-char hashes; always `padStart(64, '0')` before use.
- **Replication factor matters**: Batcher(1, ...) limits peer discovery; use Batcher(3, ...) minimum for resilience.
