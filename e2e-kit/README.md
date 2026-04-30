# Persistent Agent Kit E2E

This folder is the judge-facing path for the pivot.

It demonstrates **Persistent Agent Kit** as a general agent-building framework, with **Protocol Twins** as the example app:

- install Claude-style skills onto persistent agents
- create protocol-specific agent brains
- generate a proof bundle
- optionally upload skill/proof artifacts to 0G Storage
- optionally register ENS gateway records for each agent
- optionally use verified 0G Compute reasoning

## Fast Local Demo

```bash
./quickstart.sh
```

This runs in dry mode and writes:

```text
infra/deploy/protocol-twins/latest-demo.json
```

## Full Protocol Demo

Requires `.env` with `PRIVATE_KEY`, funded 0G testnet account, and the ENS gateway running.

```bash
PROTOCOL_TWINS_VERIFIED=1 \
PROTOCOL_TWINS_UPLOAD=1 \
PROTOCOL_TWINS_REGISTER_ENS=1 \
./quickstart.sh
```

## What This Proves

- Skills are portable packages loaded from `.claude/skills`.
- Agents have persistent brain state and installed skill manifests.
- Protocol-specific agents can be composed for cross-protocol builder tasks.
- Proof bundles record agents, skills, roots, and verification counts.
- 0G/AXL/ENS are framework primitives, not demo-only add-ons.
