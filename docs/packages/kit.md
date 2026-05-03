# @cortex/kit

Agent framework built on `@cortex/core`. Everything here is above the network layer: brain structure, skill packs, episodic memory, ENS identity, verified inference, and the high-level `Agent` facade.

**Package:** `packages/kit/`

---

## Agent facade (`src/Agent.ts`)

High-level object wrapping brain + memory + inference + messaging. Use this for new agents. Use the lower-level exports directly for fine-grained control.

```typescript
import { Agent, type CortexManifest } from '@cortex/kit';
```

### `Agent.create(manifest, opts?): Promise<Agent>`

Create a fresh agent: builds brain, uploads to 0G Storage, registers ENS.

```typescript
const agent = await Agent.create({
  name: 'zerog-builder',
  ensName: 'zerog-builder.cortex.eth',
  protocol: '0G',
  mission: 'Expert in 0G Storage and Compute patterns.',
  skills: [],
  boundaries: ['Never recommend mainnet ops.'],
  visibility: 'private',
}, {
  aesKey: Buffer.from(myKey),  // 32 bytes; omit to auto-generate
  axlApiUrl: 'http://127.0.0.1:9002',
});
```

`visibility: 'private'` → AES-256 encrypt before upload. `'public'` → plain upload.

### `Agent.load(ensName, opts?): Promise<Agent>`

Load existing agent from ENS. Reads `agent.resume` text record, downloads brain from 0G.

```typescript
const agent = await Agent.load('zerog-builder.cortex.eth', {
  aesKey: Buffer.from(myKey),  // required if visibility === 'private'
  axlApiUrl: 'http://127.0.0.1:9002',
});
```

Pass `aesKey: null` to force plain download.

### `agent.ask(question): Promise<{ text, verified }>`

Run verified inference using agent's mission as system prompt.

```typescript
const { text, verified } = await agent.ask('How does 0G KV streaming work?');
// verified === false means TeeML proof failed — treat as unverified
```

### `agent.remember(key, value): Promise<void>`

Write key/value to 0G KV state stream for this agent.

### `agent.recall<T>(key): Promise<T | null>`

Read from 0G KV state stream.

### `agent.appendEpisode(entry): Promise<void>`

Append to episodic log on 0G KV.

```typescript
await agent.appendEpisode({
  task: 'answer_query',
  outcome: 'worked',
  protocol: '0G',
});
```

### `agent.send(targetEnsName, message): Promise<void>`

Resolve target's `agent.axl_peer` text record, send `ProtocolAgentMessage` via AXL.

### `agent.listen(onMessage): () => void`

Start AXL recv loop. Returns unsubscribe function (calls `AbortController.abort()`).

```typescript
const stop = agent.listen(async (msg, fromPeer) => {
  if (msg.type === 'protocol-agent/task') {
    const reply = await agent.ask(msg.text);
    await agent.send(msg.from, { type: 'protocol-agent/reply', text: reply.text, ... });
  }
});
process.on('SIGTERM', stop);
```

### `agent.save(opts?): Promise<{ rootHash }>`

Re-serialize brain, upload to 0G, update ENS `agent.resume`. Required to persist any `brain.*` mutations.

---

## Brain (`src/agent/brain.ts`)

### `PersistentAgentBrain` (type)

```typescript
interface PersistentAgentBrain {
  schemaVersion: 'persistent-agent-kit/v1';
  identity: {
    name: string;
    ensName?: string;
    protocol?: string;
    mission: string;
    boundaries: string[];
  };
  skills: InstalledSkill[];
  memory: {
    semantic: KnowledgeNote[];
    procedural: FixPattern[];
    recentEpisodes: IntegrationEvent[];
    episodicStreamId?: string;
  };
  integrations: {
    axlPeerId?: string;
    inftTokenId?: number;
    brainRootHash?: string;
  };
  updatedAt: number;
}
```

### `createAgentBrain(input): PersistentAgentBrain`

Factory with safe defaults. All fields optional except `name` and `mission`.

### `summarizeAgent(brain): string`

Single-string dump of identity + top 5 skills + recent knowledge notes. Useful as context in prompts.

---

## Verified inference (`src/inference/zerog.ts`)

```typescript
import { verifiedReason } from '@cortex/kit';

const result = await verifiedReason([
  { role: 'system', content: 'You are a 0G expert.' },
  { role: 'user', content: 'What is 0G Compute?' },
]);
// throws if result.verified === false
console.log(result.text, result.verified, result.provider);
```

`verifiedReason` throws on unverified responses. Use `chat()` from `@cortex/core` directly if you need the raw unverified path.

---

## Skills (`src/skills/`)

### Skill file format

Each skill lives in its own subdirectory with a `SKILL.md`:

```
.claude/skills/
  zerog-recipes/
    SKILL.md
  spawn-axl-cohort/
    SKILL.md
```

`SKILL.md` frontmatter:

```markdown
---
name: zerog-recipes
description: Copy-paste 0G storage/compute snippets
version: 1.2.0
triggers: storage,compute,upload,download,kv,stream
---

## Use when
...
```

If `triggers` is omitted, inferred from name + description + "Use when" paragraph.

### `loadSkillDirectory(dir): SkillPack[]`

Read all `*/SKILL.md` under `dir`. Returns parsed `SkillPack[]`.

### `loadSkillPack(path): SkillPack`

Parse single `SKILL.md`.

### `selectSkillsForTask(skills, task, limit?): SelectedSkill[]`

Keyword overlap scoring. Name hit = +2. Returns top `limit` skills (default 3) with score > 0.

```typescript
const selected = selectSkillsForTask(agentSkills, 'How do I upload to 0G?', 3);
// [{ skill: SkillPack, score: 4, matchedTriggers: ['upload', 'storage'] }]
```

### `buildSkillPrompt(selected, task): string`

Injects selected skill instructions + task into a single prompt string:

```
Task:
How do I upload to 0G?

Selected skills:
## Skill: zerog-recipes@1.2.0
...instructions...
```

---

## Memory (`src/memory/`)

### `appendIntegrationEvent(agentName, entry): Promise<IntegrationEvent>`

Append to 0G KV episodic stream. Stream ID = `streamIdFromLabel('persistent-agent:<agentName>:episodic')`.

```typescript
import { appendIntegrationEvent } from '@cortex/kit';

await appendIntegrationEvent('zerog-builder', {
  task: 'peer_query',
  outcome: 'worked',
  protocol: '0G',
  error: undefined,
});
```

`IntegrationEvent` fields: `id`, `timestamp` (auto-set), `task`, `outcome`, `protocol`, `error?`.

### `readIntegrationEvents(agentName, fromSeq?): Promise<IntegrationEvent[]>`

Read episodic log from 0G KV.

### `setAgentState<T>(agentName, key, value): Promise<void>`

KV write to state stream.

### `getAgentState<T>(agentName, key): Promise<T | null>`

KV read from state stream.

### `memoryStreamId(agentName, kind): string`

Returns deterministic stream ID. `kind` = `'episodic' | 'state' | 'skills'`.

---

## ENS Identity (`src/identity/ens.ts`)

```typescript
import { registerAgentEns, resolveAgentEns, agentEnsTextRecords } from '@cortex/kit';
```

### `registerAgentEns(input): Promise<AgentEnsRecords>`

POST to ENS gateway `/set`. Creates or upserts text records.

```typescript
await registerAgentEns({
  ensName: 'zerog-builder.cortex.eth',
  texts: agentEnsTextRecords({
    protocol: '0G',
    axlPeerId: myPeerId,
    brainRootHash: rootHash,
  }),
});
```

Reads `ENS_GATEWAY_URL` (default `http://localhost:8787`).

### `resolveAgentEns(ensName): Promise<AgentEnsRecords>`

GET `/lookup/<name>`. Returns `{ name, addr, texts }`.

### `agentEnsTextRecords(input): Record<string, string>`

Build standard text record map from components. Always includes `agent.framework: 'persistent-agent-kit'`.

| Input field | Text record key |
|-------------|----------------|
| `protocol` | `agent.protocol` |
| `axlPeerId` | `agent.axl_peer` |
| `brainRootHash` | `agent.resume` = `0g://<hash>` |
| `skillManifestRootHash` | `agent.skills` |
| `inft` | `agent.inft` |
| `episodicStreamId` | `agent.memory.episodic` |

---

## Transport (`src/transport/`)

### AXL (`axl.ts`)

```typescript
import { sendProtocolAgentMessage, currentAxlPeerId, type ProtocolAgentMessage } from '@cortex/kit';
```

`ProtocolAgentMessage` types: `protocol-agent/task | reply | memory | proof`.

```typescript
await sendProtocolAgentMessage('http://127.0.0.1:9002', peerId, {
  type: 'protocol-agent/task',
  sessionId: 'sess-123',
  from: 'zerog-builder',
  text: 'What storage pattern fits a 50MB model checkpoint?',
  ts: Date.now(),
});
```

### MCP (`mcp.ts`)

```typescript
import { registerSkillAsMcpTool } from '@cortex/kit';

await registerSkillAsMcpTool('http://127.0.0.1:9003', {
  name: 'zerog-recipes',
  version: '1.0.0',
  description: 'Snippets for 0G storage/compute',
  triggers: ['storage', 'upload', 'kv'],
  installedAt: Date.now(),
  enabled: true,
});
```

Registers skill as a JSON-RPC 2.0 tool on the AXL MCP router. Claude Desktop can then invoke it.
