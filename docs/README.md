# Cortex Docs

Framework for persistent AI agents. All inference via 0G Compute (TeeML). Brain encrypted on 0G Storage. Identity via ENS. Peer comms via AXL.

## Contents

| Doc | What it covers |
|-----|----------------|
| [architecture.md](./architecture.md) | Full system design, data flows, package relationships |
| [quickstart.md](./quickstart.md) | Run the full stack locally in ~10 min |
| [env-vars.md](./env-vars.md) | Every environment variable, required vs optional |
| **Packages** | |
| [packages/core.md](./packages/core.md) | `@cortex/core` — raw 0G + AXL wrappers |
| [packages/kit.md](./packages/kit.md) | `@cortex/kit` — agent framework (brain, skills, memory, ENS) |
| [packages/protocol-twins.md](./packages/protocol-twins.md) | Three live protocol-expert agents with evolution |
| [packages/apply-twin.md](./packages/apply-twin.md) | Self-twin MCP server for job search |
| [packages/ens-gateway.md](./packages/ens-gateway.md) | CCIP-read offchain ENS resolver |
| [packages/smith.md](./packages/smith.md) | Persona minting pipeline |
| [packages/contracts.md](./packages/contracts.md) | On-chain contracts (MintPersona, OffchainResolver) |
| **Infra** | |
| [infra/axl.md](./infra/axl.md) | AXL mesh setup, port scheme, spawn script |
| [infra/deploy.md](./infra/deploy.md) | Fly.io deployment, start-stack, Vercel |

## Quick orientation

```
@cortex/core        Raw 0G + AXL
     ↑
@cortex/kit         Agent framework built on core
     ↑
protocol-twins      Example: 3 live expert agents
apply               Example: Self-twin MCP server
smith               Example: Persona mint pipeline
```

Contracts on 0G Galileo (chainId 16602).  
Addresses in `infra/deploy/addresses.json` — never hardcoded.
