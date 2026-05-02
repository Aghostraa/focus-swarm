---
name: apply-twin-patterns
description: Apply-twin reference implementation patterns. HTTP MCP server, KV state, episodic memory, self-evolution. Use when building persistent agents with verifiable inference and local state.
---

# apply-twin-patterns

Reference patterns from the apply-twin implementation (`packages/apply/src/`). Use these for any agent that needs:
- Persistent HTTP server (MCP or custom)
- 0G KV state management
- Episodic memory logging
- Implicit skill auto-selection
- Periodic brain consolidation + evolution

## HTTP Server Pattern (MCP JSON-RPC)

The apply-twin exposes tools via HTTP JSON-RPC 2.0 on port 9013:

```typescript
import http from 'node:http';

const MCP_PORT = 9013;

const server = http.createServer(async (req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200);
    res.end(JSON.stringify({ tools: TOOL_DEFS }));
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end();
    return;
  }

  // Read body with timeout + error handling
  let body = '';
  await new Promise<void>((resolve, reject) => {
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve());
    req.on('error', reject);
    setTimeout(() => reject(new Error('request timeout')), 5000);
  });

  let rpc: any;
  try {
    rpc = JSON.parse(body);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }

  const respond = (result: unknown, error?: unknown) => {
    const payload = error
      ? { jsonrpc: '2.0', id: rpc.id, error: { code: -32000, message: String(error) } }
      : { jsonrpc: '2.0', id: rpc.id, result };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  try {
    if (rpc.method === 'tools/list') {
      respond({ tools: TOOL_DEFS });
    } else if (rpc.method === 'tools/call') {
      const { name, arguments: args = {} } = rpc.params ?? {};
      const result = await handleToolCall(name, args);
      respond({
        content: [{
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }]
      });
    }
  } catch (e) {
    respond(null, (e as Error).message);
  }
});

server.listen(MCP_PORT, () => {
  console.log(`MCP server :${MCP_PORT}`);
});
```

## KV State Pattern

Tools read/write agent state via 0G KV:

```typescript
import { setAgentState, getAgentState } from '@cortex/kit';

const AGENT_NAME = 'apply-twin';

export async function getProfile(): Promise<ProfileData | null> {
  try {
    return await getAgentState<ProfileData>(AGENT_NAME, 'profile');
  } catch (e) {
    console.warn('[apply-twin] profile read failed:', (e as Error).message);
    return null; // Graceful fallback
  }
}

export async function setProfile(data: ProfileData): Promise<void> {
  await setAgentState(AGENT_NAME, 'profile', data);
}

export async function trackApplication(record: ApplicationRecord): Promise<void> {
  const tracker = (await getAgentState(AGENT_NAME, 'pipeline')) ?? { applications: [] };
  const idx = tracker.applications.findIndex(a => a.id === record.id);
  if (idx >= 0) {
    tracker.applications[idx] = record;
  } else {
    tracker.applications.push(record);
  }
  await setAgentState(AGENT_NAME, 'pipeline', tracker);
}
```

Under the hood, stream IDs are deterministic:
```typescript
// From packages/kit/src/memory/store.ts
function memoryStreamId(agentName: string, kind: 'episodic' | 'state' | 'skills'): string {
  return streamIdFromLabel(`persistent-agent:${agentName}:${kind}`);
}

// streamIdFromLabel returns 0x + 64 hex chars (32 bytes)
// Persists across runs because it's derived from the label
```

## Profile Init Pattern

Load profile from local files on startup:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface ProfileContext {
  profileContext: string;
  styleGuide: string;
}

function findPackageRoot(): string {
  // Walk up until we find style-guide.md (domain-specific marker)
  let current = process.cwd();
  while (current !== '/') {
    try {
      readFileSync(join(current, 'style-guide.md'));
      return current;
    } catch {
      current = join(current, '..');
    }
  }
  throw new Error('Could not find package root (no style-guide.md)');
}

export async function loadProfileContext(): Promise<ProfileContext> {
  const rootDir = findPackageRoot();
  const profileContext = readFileSync(join(rootDir, 'profile-context.md'), 'utf-8');
  const styleGuide = readFileSync(join(rootDir, 'style-guide.md'), 'utf-8');
  return { profileContext, styleGuide };
}
```

Initialize once on startup:
```typescript
const context = await loadProfileContext();
const profile = {
  summary: context.profileContext.split('\n')[0],
  experience: context.profileContext,
  skills: [],
  culture: context.styleGuide,
};
await setAgentState(AGENT_NAME, 'profile', profile);
console.log('✓ Profile initialized');
```

## TeeML Tool Pattern

Every tool that calls verifiedReason must validate the seal:

```typescript
import { verifiedReason } from '@cortex/kit';

export async function researchCompany(company: string): Promise<string> {
  const messages = [
    {
      role: 'system',
      content: 'You are an expert researcher. Provide factual company research.'
    },
    { role: 'user', content: `Research: ${company}` },
  ];

  const result = await verifiedReason(messages);
  if (!result.verified) {
    throw new Error('TeeML verification failed');
  }

  // Log interaction for episodic memory
  await appendIntegrationEvent(AGENT_NAME, {
    task: 'research_company',
    integration: 'research',
    outcome: 'success',
    notes: `Company: ${company}`,
  }).catch(() => {});

  return result.text;
}
```

## Implicit Skill Selection Pattern

Instead of hard-coding skills, auto-select based on the task:

```typescript
import { loadSkillDirectory, selectSkillsForTask, buildSkillPrompt } from '@cortex/kit';
import { resolve } from 'path';

// On startup
const skillDir = resolve('.claude/skills');
const allSkills = await loadSkillDirectory(skillDir);
const agentSkills = allSkills.filter(s => config.skills?.includes(s.name));

// In tool handler
export async function draftCoverLetter(
  company: string,
  role: string,
  jd: string
): Promise<string> {
  const profile = await getProfile();
  if (!profile) throw new Error('No profile loaded');

  const task = `Draft cover letter for ${company} ${role}: ${jd.slice(0, 200)}`;
  const selected = selectSkillsForTask(agentSkills, task);
  const skillPrompt = buildSkillPrompt(selected, task);

  const messages = [
    { role: 'system', content: `You are a job application expert. Use the candidate profile: ${profile.summary}` },
    { role: 'user', content: skillPrompt },
  ];

  const result = await verifiedReason(messages);
  if (!result.verified) throw new Error('TeeML verification failed');

  return result.text;
}
```

## Self-Evolution Trigger Pattern

After every N interactions, consolidate memory + re-upload brain:

```typescript
import { consolidateMemory } from '@cortex/kit';
import { uploadPlain } from '@cortex/core';
import { registerAgentEns, agentEnsTextRecords } from '@cortex/kit';

let interactionCount = 0;
const EVOLUTION_INTERVAL = 10; // Re-upload brain every 10 interactions

async function maybeEvolve() {
  interactionCount++;
  if (interactionCount % EVOLUTION_INTERVAL !== 0) return;

  console.log(`[apply-twin] Evolution trigger: consolidating memory...`);

  try {
    const events = await readIntegrationEvents(AGENT_NAME, 0);
    const currentBrain = {
      identity: { name: AGENT_NAME },
      memory: { episodic: events },
      skills: [],
    };

    // Verified consolidation via 0G Compute
    const consolidated = await consolidateMemory(currentBrain, events, { verified: true });

    // Re-upload brain (plaintext for public agents)
    const brainBytes = Buffer.from(JSON.stringify(consolidated), 'utf-8');
    const { rootHash } = await uploadPlain(brainBytes);

    // Update ENS pointer (agent.resume always tracks latest rootHash)
    await registerAgentEns({
      ensName: 'apply.cortex.eth',
      texts: agentEnsTextRecords({
        brainRootHash: rootHash,
        protocol: 'apply',
      }),
    });

    console.log(`[apply-twin] Brain evolved → ${rootHash}`);
  } catch (e) {
    console.warn(`[apply-twin] Evolution failed (non-fatal): ${(e as Error).message}`);
  }
}
```

## Integration Checklist

- [ ] HTTP server listens on correct port
- [ ] Body parsing has 5s timeout + error handlers
- [ ] All tools wrapped in try-catch that logs errors
- [ ] `verifiedReason` result always checked for `verified === true`
- [ ] `appendIntegrationEvent` called after each tool (fire-and-forget safe)
- [ ] Profile context loaded once on startup
- [ ] Skills auto-selected based on task (not hard-coded)
- [ ] Evolution trigger fires every N interactions
- [ ] ENS registration updates on every brain re-upload
- [ ] Stream IDs derived from label (not random)
