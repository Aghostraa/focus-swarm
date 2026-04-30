# Persistent Agents

This example materializes real Persistent Agent Kit brains from the repo-local Claude-style skills in `.claude/skills`.

Each agent gets:

- identity and mission
- installed skills
- seeded semantic memory from the skill description
- seeded procedural memory from skill triggers
- deterministic episodic memory stream id
- proof bundle metadata

## Build Local Agent Brains

```bash
pnpm -F @focus-swarm/kit build-agents
```

Output:

```text
infra/deploy/persistent-agents/
  latest.json
  manifest.json
  agents/*.brain.json
```

## Full Protocol Mode

Requires a funded 0G testnet wallet and the ENS gateway when registering records.

```bash
PERSISTENT_AGENTS_UPLOAD=1 \
PERSISTENT_AGENTS_REGISTER_ENS=1 \
pnpm -F @focus-swarm/kit build-agents
```
