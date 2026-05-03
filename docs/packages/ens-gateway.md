# @cortex/ens-gateway

CCIP-read offchain ENS resolver (EIP-3668). Exposes a REST API that agents call to register and resolve ENS subnames under `cortex.eth`. Backed by SQLite. Signs responses for the on-chain `OffchainResolver.sol` verifier.

**Package:** `packages/ens-gateway/`  
**Start:** `pnpm -F @cortex/ens-gateway dev`  
**Default port:** `8787`

---

## How it fits into ENS resolution

```
ENS resolution (on-chain)
    ↓
OffchainResolver.sol reverts OffchainLookup(gatewayUrl, calldata)
    ↓
Client fetches: GET <gatewayUrl>/ccip/<sender>/<calldata>
    ↓
Gateway signs EIP-3668 response with ENS_GATEWAY_SIGNER_KEY
    ↓
Client calls OffchainResolver.resolve(bytes name, bytes result, bytes sig)
    ↓
On-chain signature verification passes → returns record value
```

For agent-to-agent use, agents call the gateway's HTTP API directly (not through on-chain ENS). The CCIP flow is for external ENS clients.

---

## Database

SQLite at `infra/deploy/ens.db` (or `ENS_GATEWAY_DB`).

Schema:
```sql
CREATE TABLE IF NOT EXISTS records (
  name  TEXT PRIMARY KEY,
  addr  TEXT,
  texts TEXT NOT NULL DEFAULT '{}'
);
```

`texts` column: JSON object of text records (e.g. `{"agent.protocol": "0G", "agent.axl_peer": "0x..."}`).

---

## REST API

### `POST /set`

Create or upsert a record. Called by agents at boot via `registerAgentEns()`.

```bash
curl -X POST http://localhost:8787/set \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "zerog-builder.cortex.eth",
    "addresses": { "60": "0xABC..." },
    "texts": {
      "agent.framework": "persistent-agent-kit",
      "agent.protocol": "0G",
      "agent.axl_peer": "0x3f2a...",
      "agent.resume": "0g://0xd848..."
    }
  }'
```

Response:
```json
{ "ok": true, "name": "zerog-builder.cortex.eth", "addr": "0xABC...", "texts": { ... } }
```

Upsert merges texts — existing keys not in the new payload are preserved.

### `GET /lookup/:name`

Resolve any registered name. Called by `resolveAgentEns()`.

```bash
curl http://localhost:8787/lookup/zerog-builder.cortex.eth
```

Response:
```json
{
  "name": "zerog-builder.cortex.eth",
  "addr": "0xABC...",
  "texts": {
    "agent.framework": "persistent-agent-kit",
    "agent.axl_peer": "0x3f2a...",
    "agent.resume": "0g://0xd848..."
  }
}
```

404 if name not registered.

### `GET /personas?market=<string>`

Catalog endpoint. Returns all registered agents. Optional `market` filter: returns agents whose `agent.target_market` text record contains any word from the query.

```bash
curl 'http://localhost:8787/personas?market=genz+renter'
```

Used by `@cortex/smith` `awakenPersonas()` to find candidates for a session.

### `GET /ccip/:sender/:data`

EIP-3668 endpoint. Called by ENS clients during CCIP-read resolution. `data` is ABI-encoded `resolve(bytes name, bytes calldata)` including selector.

Handles:
- `addr(bytes32 node)` — returns 20-byte address
- `text(bytes32 node, string key)` — returns text record value

Response:
```json
{ "data": "0x..." }  // ABI-encoded (result, expires, sig)
```

Requires `ENS_GATEWAY_SIGNER_KEY` env var. Signs with EIP-712 using the verifier contract address + 1-hour expiry.

---

## Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `ENS_GATEWAY_PORT` | `8787` | Listen port |
| `ENS_GATEWAY_DB` | `infra/deploy/ens.db` | SQLite path (relative to repo root) |
| `ENS_GATEWAY_SIGNER_KEY` | — | ECDSA key for signing CCIP responses (required for CCIP) |
| `ENS_GATEWAY_VERIFIER_ADDRESS` | from `addresses.json` | `OffchainResolver` contract address |

---

## Deployed contract

**`OffchainResolver`** on 0G Galileo (chainId 16602):  
`0xaB32d4b316bE27cE47fCbf92A321f24B22c49121`

Address read from `infra/deploy/addresses.json` — never hardcoded in source.

---

## Standard ENS text records for Cortex agents

| Key | Value format | Example |
|-----|-------------|---------|
| `agent.framework` | always `persistent-agent-kit` | |
| `agent.protocol` | track identifier | `0G`, `AXL`, `ENS` |
| `agent.axl_peer` | Yggdrasil pubkey hex | `0x3f2a...` |
| `agent.resume` | 0G brain root hash URI | `0g://0xd848...` |
| `agent.skills` | 0G skill manifest URI | `0g://0xabcd...` |
| `agent.inft` | `<contract>:<tokenId>` | `0x1f45...:7` |
| `agent.memory.episodic` | 0G KV stream URI | `0gkv://0x1234...` |
| `agent.target_market` | free-form string | `genz renters berlin` |

---

## Deploy to fly

The ENS gateway ships as part of the full judging stack. See `infra/deploy/judging/fly.toml` and `Dockerfile`. It is started via `start-stack.mjs` as a child process alongside the protocol twins and demo-gateway.
