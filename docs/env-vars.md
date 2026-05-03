# Environment Variables

All variables go in `.env` at the repo root. `.env.local` overrides.

## Required for any 0G operation

```env
PRIVATE_KEY=0x<your-0g-testnet-key>
```

Fund at https://faucet.0g.ai (testnet Galileo, chainId 16602).

## 0G Network

| Variable | Default | Notes |
|----------|---------|-------|
| `ZG_RPC_URL` | `https://evmrpc-testnet.0g.ai` | Galileo RPC |
| `ZG_INDEXER_URL` | `https://indexer-storage-testnet-turbo.0g.ai` | Storage indexer |
| `ZG_KV_NODE_URL` | `http://3.101.147.150:6789` | KV node |
| `ZG_CHAIN_ID` | `16602` | Galileo chain ID |
| `ZG_COMPUTE_MODEL` | `qwen/qwen-2.5-7b-instruct` | 0G Compute model |
| `ZEROG_BROKER_URL` | — | Required for compute inference |

## ENS Gateway

| Variable | Default | Notes |
|----------|---------|-------|
| `ENS_GATEWAY_URL` | `http://localhost:8787` | URL agents call to register/resolve |
| `ENS_GATEWAY_PORT` | `8787` | Gateway listen port |
| `ENS_GATEWAY_DB` | `infra/deploy/ens.db` | SQLite database path |
| `ENS_GATEWAY_SIGNER_KEY` | — | ECDSA key for signing CCIP-read responses |
| `ENS_GATEWAY_VERIFIER_ADDRESS` | from `addresses.json` | OffchainResolver address |

## AXL Mesh

| Variable | Default | Notes |
|----------|---------|-------|
| `AXL_API_URL` | `http://127.0.0.1:9002` | HTTP bridge for node 0 |
| `AXL_MCP_URL` | `http://127.0.0.1:9003` | MCP router for node 0 |
| `AXL_BASE_PORT` | `9002` | Base API port (port for node i = base + i×stride) |
| `AXL_PORT_STRIDE` | `10` | Port gap between nodes |
| `AXL_MCP_BASE_PORT` | `9003` | Base MCP port |
| `AXL_BIN` | `infra/axl/bin/node` | Path to AXL binary |

## Protocol Twins

| Variable | Default | Notes |
|----------|---------|-------|
| `HTTP_PORT` | per config | Override per twin (9013, 9023, 9033) |
| `SKILL_DIR` | `.claude/skills` | Directory of skill .md files |

## Apply Twin

| Variable | Default | Notes |
|----------|---------|-------|
| `APPLY_MCP_PORT` | `9013` | MCP server port |
| `APPLY_ENS_NAME` | `apply.cortex.eth` | ENS subname for this twin |

## Persona Runtime

| Variable | Default | Notes |
|----------|---------|-------|
| `PERSONA_TOKEN_ID` | — | iNFT token ID (required) |
| `PERSONA_ROOT_HASH` | — | Encrypted brain root hash (required) |
| `PERSONA_KEY_PATH` | — | AES-256 key file path (required) |
| `PEER_LIST_PATH` | `./infra/axl/peers.local.json` | Peer manifest |

## Moderator / Session

| Variable | Default | Notes |
|----------|---------|-------|
| `SESSION_ID` | `s-{timestamp}` | Session identifier |
| `PRODUCT_BRIEF` | `"Generic product"` | What the session is about |
| `TOTAL_TURNS` | `12` | Number of turns |
| `TURN_INTERVAL_MS` | `2000` | Delay between turns |
| `REPORTS_DIR` | `./infra/deploy/reports` | Where to write reports |
| `RESEARCH_GOALS` | — | JSON array of research goals |
| `MODERATION_STYLE` | `"breadth"` | `breadth` \| `deep-dive` \| `conflict-seeking` |
| `SESSION_EVENTS_PATH` | — | Optional event log file |
| `PERSONA_MAP` | — | JSON: `{ peerId: { archetype, role, ensName } }` |

## Orchestrator

| Variable | Default | Notes |
|----------|---------|-------|
| `TARGET_MARKET` | `"general consumers"` | Focus group target |
| `ARCHETYPES` | `"genz-renter-berlin,..."` | Comma-separated archetype slugs |
| `COHORT_ID` | current timestamp | Cohort identifier |

## Demo Gateway / Judging Stack

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `8080` | Demo gateway listen port |
| `ZEROG_TWIN_URL` | `http://127.0.0.1:9013` | Override 0G twin URL |
| `AXL_TWIN_URL` | `http://127.0.0.1:9023` | Override AXL twin URL |
| `ENS_TWIN_URL` | `http://127.0.0.1:9033` | Override ENS twin URL |
| `CORS_ORIGIN` | `*` | CORS allowed origin |

## Vercel / Next.js UI

| Variable | Default | Notes |
|----------|---------|-------|
| `CORTEX_DEMO_API` | — | If set, UI proxies to this backend instead of calling local twins directly |

## What to set locally (minimum)

```env
PRIVATE_KEY=0x...
ZEROG_BROKER_URL=...
ENS_GATEWAY_SIGNER_KEY=0x...
```

Everything else defaults to testnet Galileo.
