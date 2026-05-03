# @cortex/protocol-twins

Three persistent protocol-expert agents (0G, AXL, ENS) that answer questions, collaborate via AXL peer queries, and evolve their skill packs when fed failure messages.

**Package:** `packages/protocol-twins/`  
**Start:** `pnpm -F @cortex/protocol-twins dev`  
**Ports:** `:9013` (zerog-builder), `:9023` (axl-builder), `:9033` (ens-builder)

---

## Overview

Each twin is a long-running Node process:

1. Connects to its dedicated AXL node
2. Gets its Yggdrasil public key
3. Loads skill packs from `.claude/skills/`
4. Registers ENS subname with `agent.axl_peer`
5. Starts HTTP server on its port
6. Pumps AXL receive loop for `peer_query` / `answer` / `skill_evolved` messages

---

## HTTP API

All three twins expose identical HTTP endpoints.

### `GET /`

Health check.

```json
{ "agent": "zerog-builder", "protocol": "0G", "ready": true }
```

### `GET /capabilities`

Agent metadata + skill list.

```json
{
  "agent": "zerog-builder",
  "protocol": "0G",
  "skills": ["zerog-recipes", "spawn-axl-cohort"],
  "httpPort": 9013,
  "ensName": "zerog-builder.cortex.eth"
}
```

### `GET /evolution-status`

Current evolution state.

```json
{
  "lastEvolved": 1714900000000,
  "interactionCount": 42,
  "isEvolving": false,
  "skillsLoaded": 3
}
```

### `POST /ask`

Ask the twin a question. Answer via `verifiedReason()` (0G Compute, TeeML).

```bash
curl -X POST http://localhost:9013/ask \
  -H 'Content-Type: application/json' \
  -d '{"message": "How do I upload encrypted data to 0G?", "context": "optional"}'
```

Response:
```json
{
  "answer": "...",
  "verified": true,
  "skill": "zerog-recipes",
  "from": "zerog-builder"
}
```

### `POST /project`

Start a live project discussion. Twin declares its role and fires peer queries to other twins over AXL.

```bash
curl -X POST http://localhost:9013/project \
  -H 'Content-Type: application/json' \
  -d '{"description": "Decentralized AI inference marketplace", "projectId": "proj-abc"}'
```

Response:
```json
{
  "agent": "zerog-builder",
  "role": "Persistent storage layer for model weights and proofs",
  "components": ["0G Storage", "0G KV", "0G Compute"],
  "needs": ["peer discovery mechanism", "ENS identity for agents"],
  "provides": ["encrypted brain storage", "TeeML verified inference"],
  "verified": true,
  "projectId": "proj-abc"
}
```

Peer queries fire in the background. Poll `/session/:projectId` to get accumulated exchanges.

### `GET /session/:projectId`

Retrieve accumulated peer exchanges for a project.

```json
{
  "projectId": "proj-abc",
  "caps": { "agent": "zerog-builder", "role": "...", ... },
  "peerExchanges": [
    {
      "from": "zerog-builder",
      "to": "axl-builder",
      "question": "How should my 0G storage layer integrate with your P2P sync?",
      "answer": "...",
      "verified": true,
      "skill": "spawn-axl-cohort"
    }
  ],
  "complete": true
}
```

`complete: true` when ≥ 2 exchanges accumulated.

### `POST /evolve`

Trigger skill evolution from a failure description. Does **not** reset session state.

```bash
curl -X POST http://localhost:9013/evolve \
  -H 'Content-Type: application/json' \
  -d '{
    "failureMessage": "The agent failed to handle chunked uploads over 100MB",
    "projectId": "proj-abc"
  }'
```

Response:
```json
{
  "agent": "zerog-builder",
  "protocol": "0G",
  "evolved": true,
  "skillsUpdated": ["zerog-recipes"],
  "reason": "Added chunked upload pattern for files > 100MB",
  "newBrainHash": "0xd848...",
  "skillsBefore": [{ "name": "zerog-recipes", "hash": null }],
  "skillsAfter":  [{ "name": "zerog-recipes", "hash": null }],
  "interactionCount": 42,
  "lastEvolved": 1714900000000
}
```

`newBrainHash` — the 0G Storage root hash of the newly uploaded encrypted brain bundle. Viewable at `https://storagescan-galileo.0g.ai/tx/<hash>`.

---

## Skill evolution (`src/evolve.ts`)

```typescript
import { evolveSkills } from '@cortex/protocol-twins/evolve';

const result = await evolveSkills(agentName, agentSkills, skillDir, {
  focus: 'chunked upload failures',
  directGaps: ['The agent failed to handle chunked uploads over 100MB'],
});
```

### Options

| Field | Type | Description |
|-------|------|-------------|
| `focus` | `string?` | Prepended to the gap list in the inference prompt |
| `directGaps` | `string[]?` | Bypass reading local log files — use these strings as gaps directly |

### What `evolveSkills` does

1. If `directGaps` provided: use them as the gap list. Otherwise reads `.integration-log/*.jsonl` files.
2. Selects the most relevant skill by keyword overlap with gaps.
3. Calls `verifiedReason()` with prompt: `"update skill <name> to handle: <gaps>"`.
4. Writes updated `.md` to skill dir (saves `.bak` backup of old version).
5. Bundles all `.md` files in skill dir + `__meta` JSON.
6. Encrypts with `sha256("cortex-brain:<agentName>")` as AES-256 key.
7. Uploads via `uploadEncrypted()` to 0G Storage.
8. Returns `{ evolved, skillsUpdated, newBrainHash, reason }`.

---

## Twin configuration (`src/index.ts`)

```typescript
export interface TwinConfig {
  name: string;
  protocol: string;
  mission: string;
  boundaries?: string[];
  skills?: string[];         // skill names to load from skillDir
  ensName?: string;
  httpPort?: number;
  axlApiUrl?: string;
  axlMcpUrl?: string;
  peerEnsNames?: string[];   // ENS names to query on /project
}
```

Example (from `src/spawn.ts`):
```typescript
{
  name: 'zerog-builder',
  protocol: '0G',
  mission: 'You are zerog-builder, an expert in 0G Storage, 0G Compute, and 0G KV.',
  skills: ['zerog-recipes', 'spawn-axl-cohort'],
  ensName: 'zerog-builder.cortex.eth',
  httpPort: 9013,
  axlApiUrl: 'http://127.0.0.1:9002',
  peerEnsNames: ['axl-builder.cortex.eth', 'ens-builder.cortex.eth'],
}
```

---

## AXL message handling

The `pumpRecv` loop handles:

| Message type | Action |
|-------------|--------|
| `peer_query` | `verifiedReason()`, send `peer_answer`, store in session |
| `peer_answer` | Store in active session peerExchanges |
| `query` | `verifiedReason()`, send `answer`, log to episodic stream |
| `skill_evolved` | Log notification, no action |

---

## Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `HTTP_PORT` | per config | Override port (9013 / 9023 / 9033) |
| `SKILL_DIR` | `.claude/skills` | Where skill packs are loaded from |
| `ENS_GATEWAY_URL` | `http://localhost:8787` | For ENS registration |
| `AXL_API_URL` | `http://127.0.0.1:9002` | For node 0; other twins override per-config |

---

## Mint twins script

```bash
pnpm -F @cortex/protocol-twins mint-twins
```

Runs `src/mint-twins.ts`: calls `generatePersona` + `mintPersona` from `@cortex/smith` for each of the three protocol expert archetypes. Writes `tokenId` + `ensName` to stdout.
