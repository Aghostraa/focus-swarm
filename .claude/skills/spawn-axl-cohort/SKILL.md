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

## SwarmMsg types (for inter-agent communication)

The AXL network carries a union of message types. Agents dispatch based on `msg.type`:

```typescript
type SwarmMsg = 
  | { type: 'turn'; turnNumber: number; transcriptTail: string; researchGoals?: string[] }
  | { type: 'utterance'; from: string; slot: number; text: string; verified: boolean; turnNumber: number }
  | { type: 'observation'; imageUrl: string; description: string; timestamp: number }
  | { type: 'session-end'; sessionId: string; reportPath: string }
  | { type: 'query'; from: string; question: string; context?: string; requestId: string }
  | { type: 'answer'; from: string; question: string; answer: string; verified: boolean; requestId: string }
  | { type: 'mcp-proxy'; method: 'tools/list' | 'tools/call'; params?: any }
```

**Query/Answer pattern** (A2A):
```typescript
// Agent A sends a query
const query: SwarmMsg = {
  type: 'query',
  from: 'zerog-builder',
  question: 'How do I set up 0G KV locally?',
  context: 'I need persistent agent memory',
  requestId: `${Date.now()}-${Math.random()}`
};
await axl.send(peerBId, query);

// Agent B receives, calls verifiedReason, sends back
const answer: SwarmMsg = {
  type: 'answer',
  from: 'zerog-builder',
  question: query.question,
  answer: result.text,
  verified: result.verified,
  requestId: query.requestId
};
await axl.send(fromPeerId, answer);

// Agent A polls recv until requestId matches
const response = await pumpRecv(axl, (msg) => {
  if (msg.type === 'answer' && msg.requestId === query.requestId) {
    // handle answer
  }
});
```

## MCP-over-AXL (tool registration)

Skills are registered as tools on the AXL router port. This allows remote agents to discover and call them:

```typescript
// Register a skill as an MCP tool on the router
const axlMcpUrl = 'http://127.0.0.1:9003'; // router_port
await registerSkillAsMcpTool(axlMcpUrl, {
  name: 'zerog-recipes',
  version: '1.0.0',
  description: 'KV read/write, storage upload/download patterns',
  triggers: ['kv', '0g', 'storage'],
  installedAt: Date.now(),
  enabled: true,
});

// Remote agent can then call it
const result = await callRemoteMcpTool(
  'http://127.0.0.1:9002', // api_port of target node
  targetPeerId,
  'zerog-recipes',
  { task: 'write KV key-value' }
);
```

## pumpRecv with timeout and abort

Proper pump pattern for receiving messages in a loop:

```typescript
import { AxlClient, pumpRecv } from '@cortex/core';

const axl = new AxlClient('http://127.0.0.1:9002');
const abortController = new AbortController();

// Timeout safety
setTimeout(() => abortController.abort(), 30_000);

// Handle SIGINT gracefully
process.on('SIGINT', () => abortController.abort());

await pumpRecv(
  axl,
  async (msg: SwarmMsg, fromPeerId: string) => {
    if (msg.type === 'query') {
      console.log(`Query from ${fromPeerId}: ${msg.question}`);
      // Process...
    }
  },
  abortController.signal
);
```

## Failure modes
- Port collision: another process on 9001+i*10 → bump base or kill stale node with `lsof -i :9002 | kill -9`
- Bootstrap hang: node-0 must finish printing pubkey before node-1 dials. Check `infra/axl/logs/node-0.log` for `listening on`
- "no such file: private.pem": permissions or wrong working dir; always run from repo root
- "connection refused on 9002": ensure node is booted; check logs for startup errors
- Message not received: call `curl http://127.0.0.1:9002/topology` to verify node is connected to mesh
