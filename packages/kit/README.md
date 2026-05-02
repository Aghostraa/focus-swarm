# Persistent Agent Kit

Framework package for building persistent agents with:

- installable skills loaded from Claude-style `SKILL.md` files
- persistent agent brain schema
- operational memory for integration successes/failures
- ENS agent identity records
- AXL peer-to-peer message helpers
- 0G Compute verified reasoning wrapper
- 0G Storage proof bundle and skill manifest upload helpers

This package is the framework pivot. `cortex` becomes one example app; `Protocol Twins` is the flagship framework example.

## Protocol Twins Example

```bash
pnpm -F @cortex/kit protocol-twins
```

The dry-run path writes:

```text
infra/deploy/protocol-twins/latest-demo.json
```

Full protocol mode:

```bash
PROTOCOL_TWINS_VERIFIED=1 \
PROTOCOL_TWINS_UPLOAD=1 \
PROTOCOL_TWINS_REGISTER_ENS=1 \
pnpm -F @cortex/kit protocol-twins
```

## Framework Claim

MCP gives agents tools. Persistent Agent Kit gives tool-using agents durable identity, installable skills, persistent memory, peer-to-peer collaboration, and verifiable execution.

The Protocol Twins example demonstrates three specialist agents:

- `zerog-builder.cortex.eth`
- `axl-builder.cortex.eth`
- `ens-builder.cortex.eth`

Each twin owns protocol-specific skills and can participate in a cross-protocol builder task.
