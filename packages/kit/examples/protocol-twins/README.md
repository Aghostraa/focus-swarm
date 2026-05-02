# Protocol Twins

Protocol Twins are example persistent agents built with `@cortex/kit`.

- `zerog-builder.cortex.eth` owns 0G Storage, Compute, and iNFT integration guidance.
- `axl-builder.cortex.eth` owns AXL node, topology, `/send`/`/recv`, MCP, and A2A guidance.
- `ens-builder.cortex.eth` owns ENS subnames, text records, gateway, and discovery guidance.

The demo loads Claude-style skills from `.claude/skills`, installs them onto each twin, selects relevant skills for a builder task, produces a proof bundle, and can optionally upload skill/proof artifacts to 0G Storage.

## Dry Run

```bash
pnpm -F @cortex/kit protocol-twins
```

## Verified 0G Compute Run

```bash
PROTOCOL_TWINS_VERIFIED=1 pnpm -F @cortex/kit protocol-twins
```

## Upload Artifacts + Register ENS Gateway Records

```bash
PROTOCOL_TWINS_UPLOAD=1 PROTOCOL_TWINS_REGISTER_ENS=1 pnpm -F @cortex/kit protocol-twins
```

Output is written to `infra/deploy/protocol-twins/latest-demo.json`.
