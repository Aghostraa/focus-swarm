---
name: spawn-axl-cohort
description: Bring up N AXL peer-to-peer nodes locally with distinct identities + ports + bootstrap mesh. Use when user says "spin up axl cohort", "start N persona nodes", "boot the swarm".
---

# spawn-axl-cohort

Spawn N AXL nodes (Yggdrasil-based encrypted P2P mesh, used as agent communication layer for the cortex project).

## Inputs
- `N` — number of nodes (default 4: 1 moderator + 3 personas, or scale up)
- AXL binary at `infra/axl/bin/node` (built once via `make build` in `../0g-doc/axl/`)

## Output
- `infra/axl/keys/node-{i}.pem` — ed25519 private keys
- `infra/axl/configs/node-{i}.local.json` — per-node config with distinct ports
- N background processes, each listening:
  - api: `127.0.0.1:{9002+i*10}`
  - mcp router: `127.0.0.1:{9003+i*10}`
  - a2a: `127.0.0.1:{9004+i*10}`
- Logs: `infra/axl/logs/node-{i}.log`
- Mesh: node-0 is bootstrap; nodes 1..N-1 list `tls://127.0.0.1:9001` (or its `Listen` URI) as Peers

## Steps Claude should follow
1. Confirm `infra/axl/bin/node` exists. If not, instruct user to:
   ```
   cd ../0g-doc/axl && make build && cp ./node ../../cortex/infra/axl/bin/node
   ```
2. For each `i in 0..N-1`:
   - Generate key: `openssl genpkey -algorithm ed25519 -out infra/axl/keys/node-${i}.pem`
   - Write config from template (see below) substituting `i` into ports and key path.
3. Boot node-0 first (bootstrap). Read its public key from log line `node public key: <hex>`.
4. Boot node-1..N-1, each pointing `Peers` at node-0's `Listen` URI.
5. Verify: `curl http://127.0.0.1:9002/topology | jq` — expect `peers` array length ≥ N-1 on all nodes.
6. Save peer-id → port map to `infra/axl/peers.local.json` for downstream agents.

## Config template (`infra/axl/configs/node-{i}.local.json`)
```json
{
  "PrivateKeyPath": "infra/axl/keys/node-{i}.pem",
  "Listen": ["tls://127.0.0.1:{9001 + i*10}"],
  "Peers": [],
  "AdminListen": "tcp://127.0.0.1:{9000 + i*10}",
  "api": { "enabled": true, "listen": "127.0.0.1:{9002 + i*10}" },
  "mcp_router": { "enabled": true, "listen": "127.0.0.1:{9003 + i*10}" },
  "a2a_server": { "enabled": true, "listen": "127.0.0.1:{9004 + i*10}" }
}
```
For nodes i ≥ 1, set `"Peers": ["tls://127.0.0.1:9001"]`.

## File refs (in `../0g-doc/axl/`)
- `cmd/node/config.go:10-23` — defaults
- `docs/configuration.md:38-60` — config keys
- `api/handler.go:12-20` — endpoint registration
- `docs/api.md` — full HTTP API
- `examples/python-client/client.py:22-48` — topology query example

## Failure modes
- Port collision: another process on 9001+i*10 → bump base or kill stale node.
- Bootstrap hang: node-0 must finish printing pubkey before node-1 dials.
- "no such file: private.pem": permissions or wrong working dir; always run from repo root.
