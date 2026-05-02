# Cortex

**Persistent, decentralized AI agents** — encrypted brains on 0G Storage, ENS identity, AXL mesh routing.

Agents are defined by a `CortexManifest`, stored as encrypted JSON on 0G, discovered via ENS text records, and communicate peer-to-peer over AXL. No central broker. No OpenAI/Anthropic at runtime.

## Quick start (5 commands)

```bash
git clone <this repo> && cd focus-swarm
cp infra/deploy/env.template .env   # fill in 0G keys + ENS_GATEWAY_SIGNER_KEY
pnpm install
ENS_GATEWAY_SIGNER_KEY=0x... pnpm -F @cortex/ens-gateway dev &
npx tsx demo/01-agent-hello.ts
```

## Architecture

```
ENS name (alice.cortex.eth)
    │  agent.resume = 0g://<rootHash>
    │  agent.axl_peer = <ed25519 pubkey>
    ▼
CCIP-read gateway (ens-gateway)     ← EIP-3668 signed responses
    │
    ▼
0G Storage                          ← AES-256 encrypted brain JSON
    │  uploadEncrypted / downloadDecrypted
    ▼
AXL mesh node                       ← per-agent ed25519 identity + Yggdrasil
    │  POST /send  GET /recv
    ▼
0G Compute (TeeML)                  ← verifiedReason(), processResponse() on every reply
    │
    ▼
0G KV + Log                         ← agent.remember() / agent.recall() / appendEpisode()
```

## Track table

| Feature | Track | File |
|---|---|---|
| `Agent.create/load/save` — encrypted brain on 0G | 0G Framework | `packages/kit/src/Agent.ts` |
| `verifiedReason()` — TeeML on every reply | 0G Framework | `packages/kit/src/inference/zerog.ts` |
| `uploadEncrypted/downloadDecrypted` | 0G Agents | `packages/core/src/storage.ts` |
| `kvSet/kvGet/logAppend` — persistent memory | 0G Agents | `packages/core/src/storage.ts` |
| `pumpRecv` + `SwarmMsg` — A2A dialogue | AXL | `packages/core/src/axl.ts` |
| `registerSkillAsMcpTool` — skills on AXL router | AXL | `packages/kit/src/transport/mcp.ts` |
| `registerAgentEns/resolveAgentEns` — ENS identity | ENS | `packages/kit/src/identity/ens.ts` |
| CCIP-read EIP-3668 signed gateway | ENS | `packages/ens-gateway/src/server.ts` |
| Protocol twins — persistent AXL-native agents | AXL + Agents | `packages/protocol-twins/src/runtime.ts` |
| Apply twin — MCP tools on AXL router_port | AXL + Framework | `packages/apply/src/runtime.ts` |

## Demos (judge-facing)

```bash
npx tsx demo/01-agent-hello.ts    # Agent create/ask/remember/save/load  (0G Framework)
npx tsx demo/02-twins-chat.ts     # Two twins query/answer via AXL        (AXL + Agents)
npx tsx demo/03-ens-resolve.ts    # ENS register + resolve + CCIP         (ENS)
npx tsx demo/04-focus-session.ts  # Full 3-persona focus group            (Agents)
```

## Packages

```
packages/
  core/           0G SDK wrappers — storage, compute, AXL client, SwarmMsg
  kit/            Agent SDK — Agent class, skills, memory, ENS, MCP transport
  ens-gateway/    CCIP-read offchain resolver (Express + SQLite, EIP-3668 signed)
  protocol-twins/ Persistent twin runtime — 0G, AXL, ENS specialist agents
  apply/          Apply twin — cover letters, company research, pipeline tracker
  moderator/      Focus group turn-taking driver over AXL A2A
  smith/          Persona generator → mint iNFT → register ENS
  persona/        Persona runtime — AXL node + 0G memory + Compute inference
  synthesizer/    Post-session clustering + report writer
  contracts/      Hardhat — mint-only ERC-7857 fork (MintPersona.sol)
  ui/             Next.js researcher dashboard
```

## Hard invariants

1. **No central message broker.** All inter-agent chat goes through AXL A2A. (`packages/core/src/axl.ts`)
2. **All inference via 0G Compute.** No OpenAI / Anthropic fallback. (`packages/kit/src/inference/zerog.ts`)
3. **Brains encrypted before upload.** AES-256 default. (`packages/core/src/storage.ts:uploadEncrypted`)
4. **Testnet Galileo only.** Chain ID 16602. Never mainnet.
5. **No hardcoded contract addresses.** Read from `infra/deploy/addresses.json`.

## Network

- **Chain**: Galileo testnet (Chain ID 16602)
- **RPC**: `https://evmrpc-testnet.0g.ai`
- **Storage indexer**: `https://indexer-storage-testnet-turbo.0g.ai`
- **Faucet**: `https://faucet.0g.ai`

## Using the apply twin from any MCP client

```bash
AXL_API_URL=http://127.0.0.1:9012 pnpm -F @cortex/apply twin &
# Add to ~/.cursor/mcp.json or Claude Desktop config:
# { "mcpServers": { "apply": { "url": "http://127.0.0.1:9013" } } }
```

Tools available: `apply.draft_cover_letter`, `apply.research_company`, `apply.track_application`, `apply.get_pipeline`, `apply.update_profile`
