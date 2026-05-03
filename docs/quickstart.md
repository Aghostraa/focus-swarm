# Quickstart

Run the full judging demo stack locally in ~10 minutes.

## Prerequisites

- Node.js 22+, pnpm 9+
- A funded 0G testnet wallet (get from https://faucet.0g.ai)
- AXL binary (see step 3)

## 1. Install

```bash
git clone https://github.com/Aghostraa/focus-swarm
cd focus-swarm
pnpm install
```

## 2. Environment

```bash
cp .env.example .env   # or create .env at repo root
```

Minimum required in `.env`:

```env
PRIVATE_KEY=0x<your-0g-testnet-key>

# 0G network (defaults are already set to testnet Galileo)
ZG_RPC_URL=https://evmrpc-testnet.0g.ai
ZG_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ZG_KV_NODE_URL=http://3.101.147.150:6789

# ENS gateway signing key (can be same as PRIVATE_KEY for local dev)
ENS_GATEWAY_SIGNER_KEY=0x<your-key>
ENS_GATEWAY_VERIFIER_ADDRESS=0xaB32d4b316bE27cE47fCbf92A321f24B22c49121
```

## 3. AXL Binary

The AXL binary runs the Yggdrasil mesh nodes. For local dev (macOS/Linux):

```bash
# Build from source (requires Go 1.21+)
cd ../0g-doc/axl
make build
cp ./node /path/to/focus-swarm/infra/axl/bin/node

# Or for Linux production deploy:
# Binary already at infra/axl/bin/node-linux (built for Fly deployment)
```

## 4. Verify 0G connectivity

```bash
pnpm -F @cortex/core smoke:storage   # should print: ✓ roundtrip ok
pnpm -F @cortex/core smoke:compute   # should print: ✓ verified=true
```

## 5. Start full stack

```bash
# Terminal 1: start everything (AXL nodes + ENS gateway + protocol twins + demo-gateway)
node infra/deploy/judging/start-stack.mjs
```

Wait for output:
```
[judging-stack] starting ens-gateway: pnpm -F @cortex/ens-gateway dev
[judging-stack] starting axl-0: ...
[judging-stack] starting axl-1: ...
[judging-stack] starting axl-2: ...
[judging-stack] starting protocol-twins: ...
[judging-stack] starting demo-gateway: ...
[judging-stack] stack launch complete
[demo-gateway] listening on 0.0.0.0:8080
```

## 6. Start the UI

```bash
# Terminal 2
pnpm -F @cortex/ui dev
```

Open http://localhost:3000/protocol-twins

## What you can do

1. **Refresh status** — polls all 3 twin HTTP APIs, AXL topology, ENS records
2. **Live verified ask** — sends a question to all 3 twins via 0G Compute (TeeML)
3. **Start live discussion** — enter a project idea, twins declare roles + query peers over AXL
4. **Send follow-up** — describe what went wrong, triggers evolution cycle
5. **Generate implementation plan** — 3 protocol-specific plans via 0G Compute

## Protocol Twins only (no full stack)

```bash
pnpm -F @cortex/protocol-twins dev
```

Starts 3 twins on :9013, :9023, :9033. Requires AXL nodes already running.

## Apply Twin only

See [`packages/apply/README.md`](../packages/apply/README.md) for full setup.

```bash
cd packages/apply
cp style-guide.template.md style-guide.md
cp profile-context.template.md profile-context.md
# edit both files
pnpm profile:init   # upload encrypted brain to 0G
pnpm twin           # start MCP server :9013
```

## Deploy to Fly

```bash
# From repo root
flyctl deploy -c infra/deploy/judging/fly.toml
```

Then set `CORTEX_DEMO_API=https://cortex-judging-demo.fly.dev` in Vercel environment variables.

## Common issues

**"AXL binary missing"**
```bash
# build the binary per step 3 above
# or for local macOS use the spawn script which expects infra/axl/bin/node
```

**"0G Compute 429 rate-limited"**  
Testnet rate limits. The runtime retries 4 times with exponential backoff (14s, 28s, 56s). Wait ~2 minutes.

**"PRIVATE_KEY not set"**  
Add to `.env` at repo root. Fund via https://faucet.0g.ai.

**ENS gateway not responding**  
Check `ENS_GATEWAY_URL` — defaults to `http://127.0.0.1:8787`. The gateway must be running.
