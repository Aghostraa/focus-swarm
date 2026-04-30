# Protocol Twins

Protocol Twins are example persistent agents built with `@focus-swarm/kit`.

- `zerog-builder.focusgroup.eth` owns 0G Storage, Compute, and iNFT integration guidance.
- `axl-builder.focusgroup.eth` owns AXL node, topology, `/send`/`/recv`, MCP, and A2A guidance.
- `ens-builder.focusgroup.eth` owns ENS subnames, text records, gateway, and discovery guidance.

The demo loads Claude-style skills from `.claude/skills`, installs them onto each twin, selects relevant skills for a builder task, produces a proof bundle, and can optionally upload skill/proof artifacts to 0G Storage.

## Dry Run

```bash
pnpm -F @focus-swarm/kit protocol-twins
```

## Verified 0G Compute Run

```bash
PROTOCOL_TWINS_VERIFIED=1 pnpm -F @focus-swarm/kit protocol-twins
```

## Upload Artifacts + Register ENS Gateway Records

```bash
PROTOCOL_TWINS_UPLOAD=1 PROTOCOL_TWINS_REGISTER_ENS=1 pnpm -F @focus-swarm/kit protocol-twins
```

Output is written to `infra/deploy/protocol-twins/latest-demo.json`.
