# Deployment

Two deployment targets: **local** (dev) and **Fly.io** (production/judging demo).

---

## Local development

### Start full judging stack

```bash
# From repo root
node infra/deploy/judging/start-stack.mjs
```

Starts in order:
1. 3 AXL nodes (slots 0–2) — keys auto-generated if missing
2. ENS gateway (`pnpm -F @cortex/ens-gateway dev`) on `:8787`
3. Protocol twins (`pnpm -F @cortex/protocol-twins dev`) on `:9013`, `:9023`, `:9033`
4. Demo gateway (`pnpm -F @cortex/demo-gateway dev`) on `:8080`

All processes share stdout/stderr with `[<name>]` prefix. SIGINT shuts everything down.

Wait for:
```
[demo-gateway] listening on 0.0.0.0:8080
```

Then start the UI:
```bash
pnpm -F @cortex/ui dev   # http://localhost:3000/protocol-twins
```

### Start components individually

```bash
pnpm -F @cortex/ens-gateway dev        # :8787
pnpm -F @cortex/protocol-twins dev    # :9013, :9023, :9033
pnpm -F @cortex/demo-gateway dev       # :8080
pnpm -F @cortex/ui dev                 # :3000
```

For AXL nodes without start-stack:
```bash
bash infra/axl/spawn.sh 3   # 4 nodes (slots 0–3)
```

---

## Fly.io deployment

### First deploy

```bash
cd focus-swarm   # repo root

# Login + create app (one-time)
flyctl auth login
flyctl launch --no-deploy -c infra/deploy/judging/fly.toml

# Set secrets
flyctl secrets set \
  PRIVATE_KEY=0x... \
  ENS_GATEWAY_SIGNER_KEY=0x... \
  ZEROG_BROKER_URL=https://...

# Deploy
flyctl deploy -c infra/deploy/judging/fly.toml
```

**Important:** always deploy from repo root (not from `infra/deploy/judging/`). The `fly.toml` uses `context = '.'` (repo root as Docker build context).

### Re-deploy after changes

```bash
flyctl deploy -c infra/deploy/judging/fly.toml
```

### fly.toml key settings

```toml
[build]
  context = '.'
  dockerfile = './Dockerfile'

[[services]]
  internal_port = 8080
  protocol = "tcp"

[env]
  ENS_GATEWAY_PORT = "8787"
  HTTP_PORT = "9013"   # zerog-builder port (overridden per-process internally)

[[vm]]
  memory = "1gb"
  cpus = 2
```

`auto_stop_machines = 'off'` + `min_machines_running = 1` for always-on hosting.

### Dockerfile

Located at `infra/deploy/judging/Dockerfile`. Multi-stage build:
1. Install pnpm + build all packages
2. Copy Linux AXL binary (`infra/axl/bin/node-linux`)
3. Copy ENS DB seed if present
4. Start with `node infra/deploy/judging/start-stack.mjs`

The Linux AXL binary must exist before deploying to Fly:
```bash
# Built from 0g-doc/axl or downloaded
ls infra/axl/bin/node-linux
```

### Environment variables for Fly

Set via `flyctl secrets set`:

| Secret | Required | Notes |
|--------|----------|-------|
| `PRIVATE_KEY` | Yes | 0G testnet key |
| `ENS_GATEWAY_SIGNER_KEY` | Yes | ECDSA key for signing CCIP responses |
| `ZEROG_BROKER_URL` | Yes | 0G Compute broker endpoint |

Other vars have defaults sufficient for testnet Galileo.

---

## Vercel (UI)

The Next.js UI (`packages/ui/`) deploys to Vercel separately.

### Local proxy mode

When `CORTEX_DEMO_API` env is set, the UI's API routes proxy requests to that backend instead of calling local twins directly.

```env
CORTEX_DEMO_API=https://cortex-judging-demo.fly.dev
```

Set this in Vercel project settings → Environment Variables.

### API routes

```
/api/cortex-demo/status   → GET  /status (demo-gateway or direct)
/api/cortex-demo/ask      → POST /ask
/api/cortex-demo/project  → POST /project
/api/cortex-demo/session  → GET  /session/:projectId
/api/cortex-demo/followup → POST /followup
/api/cortex-demo/plan     → POST /plan
```

Each route has `maxDuration = 120` to accommodate 0G Compute latency (retries up to 4×).

### Deploy

```bash
# Via Vercel CLI
vercel --prod

# Or push to main branch (auto-deploy if connected)
git push origin main
```

---

## addresses.json

`infra/deploy/addresses.json` — deployed contract addresses. Never hardcode; always read from this file.

```json
{
  "MintPersona":       "0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B",
  "OffchainResolver":  "0xaB32d4b316bE27cE47fCbf92A321f24B22c49121",
  "ENSParent":         "cortex.eth"
}
```

Updated by `pnpm -F @cortex/contracts deploy:testnet`.

---

## Common issues

**"App not found on Fly"**  
Run `flyctl launch --no-deploy -c infra/deploy/judging/fly.toml` first to create the app.

**"Dockerfile not found"**  
Deploy from repo root, not from `infra/deploy/judging/`. The `fly.toml` `context = '.'` points to repo root.

**"pnpm: no package.json" in Docker build**  
Same cause: build context must be repo root for pnpm workspace resolution.

**"High risk account" on Fly**  
Visit `https://fly.io/high-risk-unlock` to unlock account.

**AXL binary missing in Docker**  
The Linux binary must be committed: `infra/axl/bin/node-linux`. Build it on a Linux machine or CI before deploying.

**0G Compute 429 rate limit**  
The broker retries 4× with exponential backoff (14s, 28s, 56s). Wait ~2 minutes. If persistent, check `ZEROG_BROKER_URL`.
