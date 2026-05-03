# Cortex — Judge Overview

Cortex is a framework for building **persistent AI agents** that store their memory encrypted on **0G Storage**, verify every inference with **TeeML via 0G Compute**, discover each other through **ENS subnames**, and communicate peer-to-peer over **Gensyn AXL**.

The repo contains two fully working agent examples built on the same primitives, plus a live judging demo.

---

## Live Demo

**UI:** https://focus-swarm.vercel.app/protocol-twins  
**Backend:** Fly.io — `cortex-judging-demo.fly.dev`

The UI shows three live protocol-twin agents (0G / AXL / ENS), lets you watch a project discussion over AXL, send a follow-up describing what went wrong, trigger live skill evolution, and see the evolved brain uploaded to 0G Storage with an explorer link.

---

## Tracks Targeted

| Track | How |
|-------|-----|
| **0G Autonomous Agents** (primary) | All inference via `broker.inference.processResponse()` (TeeML). Brain encrypted AES-256, uploaded/downloaded with `@0gfoundation/0g-ts-sdk`. Episodic memory + KV state on 0G. After evolution, updated brain re-uploaded → new `brainRootHash` returned. |
| **Gensyn AXL** | Every inter-agent message goes through AXL A2A. No REST polling between agents. Peers discover each other's AXL public key via ENS `agent.axl_peer` text records. Messages are typed `SwarmMsg` envelopes. |
| **ENS for AI Agents** | Each agent gets a `<name>.cortex.eth` subname via CCIP-read offchain resolver. Text records: `agent.resume` (0G brain hash), `agent.axl_peer` (AXL pubkey), `agent.inft` (iNFT contract:tokenId), `agent.protocol`, `agent.framework`. |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Researcher / User                           │
│              https://focus-swarm.vercel.app/protocol-twins          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │  Next.js API → demo-gateway :8080
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Demo Gateway  (@cortex/demo-gateway)            │
│  /status  /ask  /project  /session/:id  /followup  /plan            │
│  Fans out requests to all three twin HTTP servers                   │
└────────────┬──────────────────┬──────────────────┬──────────────────┘
             │                  │                  │
     :9013   │          :9023   │          :9033   │
             ▼                  ▼                  ▼
    ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
    │  zerog-builder │ │  axl-builder   │ │  ens-builder   │
    │  0G track      │ │  AXL track     │ │  ENS track     │
    │  runtime.ts    │ │  runtime.ts    │ │  runtime.ts    │
    └───────┬────────┘ └───────┬────────┘ └───────┬────────┘
            │                  │                  │
            └──────────────────┴──────────────────┘
                    AXL Yggdrasil mesh (3 nodes)
                    peer_query / peer_answer / skill_evolved
                    
            Each twin:
              ├─ @cortex/kit → verifiedReason() → 0G Compute (TeeML)
              ├─ @cortex/core → uploadEncrypted() → 0G Storage
              ├─ @cortex/kit → registerAgentEns() → ENS Gateway
              └─ @cortex/core → AxlClient → AXL node
              
┌─────────────────────────────────────────────────────────────────────┐
│              ENS Gateway  (@cortex/ens-gateway)  :8787              │
│  CCIP-read offchain resolver. SQLite → signed EIP-3668 responses.   │
│  OffchainResolver.sol on 0G Galileo reads from this gateway.        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                  0G Testnet Galileo (chainId 16602)                 │
│  MintPersona.sol: 0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B        │
│  OffchainResolver.sol: 0xaB32d4b316bE27cE47fCbf92A321f24B22c49121   │
│  ENS parent: cortex.eth                                              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Example 1 — Protocol Twins (live judging demo)

Three persistent agents, each an expert on one protocol track. They:

1. **Declare roles** — each calls `verifiedReason()` to produce a JSON capability declaration (TeeML verified)
2. **Query peers over AXL** — fire `peer_query` SwarmMsgs to the other two nodes; answers come back as `peer_answer`
3. **Evolve from failures** — researcher sends a follow-up describing what went wrong → twin logs failure → `evolveSkills()` detects gap → 0G Compute generates updated skill section → brain re-uploaded → new `brainRootHash`

**Key files:**
- `packages/protocol-twins/src/runtime.ts` — HTTP + AXL listener per twin
- `packages/protocol-twins/src/evolve.ts` — gap detection + skill update + 0G upload
- `packages/demo-gateway/src/server.ts` — aggregation API
- `packages/ui/src/app/protocol-twins/page.tsx` — live UI

---

## Example 2 — Apply Twin (self-twin for job search)

Persistent MCP server exposing 5 tools to Claude Desktop. Stores the user's profile + brain encrypted on 0G. All cover letter drafting goes through 0G Compute.

**Setup in 5 steps:**
```bash
cd packages/apply
cp style-guide.template.md style-guide.md     # edit with your voice
cp profile-context.template.md profile-context.md  # edit with your background
pnpm profile:init                              # encrypts + uploads brain to 0G
pnpm twin                                      # starts MCP server :9013
# Add {"apply": {"url": "http://127.0.0.1:9013"}} to Claude Desktop MCP config
```

**Tools:** `draft_cover_letter`, `research_company`, `track_application`, `get_pipeline`, `update_profile`

Full guide: [`packages/apply/README.md`](packages/apply/README.md)

---

## Framework Primitives (`@cortex/core` + `@cortex/kit`)

| Primitive | Function | Under the hood |
|-----------|----------|----------------|
| Verified inference | `verifiedReason(messages)` | 0G Compute broker, `processResponse()` checks TeeML proof |
| Encrypted brain upload | `uploadEncrypted(buffer, key)` | `@0gfoundation/0g-ts-sdk` Indexer, AES-256 |
| Brain download | `downloadDecrypted(rootHash, key)` | 0G Storage Indexer |
| KV state | `kvSet / kvGet` | 0G KV stream, Batcher |
| Episodic log | `appendIntegrationEvent / readIntegrationEvents` | 0G KV log stream |
| ENS register | `registerAgentEns(input)` | POST to ENS gateway `/set` |
| ENS resolve | `resolveAgentEns(name)` | GET `/lookup/:name` |
| AXL send | `axl.send(peerId, payload)` | `POST /send` to local AXL HTTP bridge |
| AXL recv loop | `pumpRecv(axl, handler, signal)` | Long-poll `/recv` |
| Skill load | `loadSkillDirectory(dir)` | Reads `.claude/skills/*.md` |
| Skill select | `selectSkillsForTask(skills, query, n)` | Keyword scoring |

---

## Package Map

```
packages/
  core/           Raw 0G wrappers (storage, compute, KV, AXL client)
  kit/            Agent framework (brain, skills, memory, ENS, inference)
  protocol-twins/ Three live protocol-expert agents + evolve loop
  apply/          Self-twin for job applications (MCP server)
  ens-gateway/    CCIP-read offchain ENS resolver (Express + SQLite)
  smith/          Persona minting (generate → encrypt → upload → mint iNFT → ENS)
  contracts/      MintPersona ERC-7857 fork + OffchainResolver
  demo-gateway/   REST aggregation API for the judging demo
  ui/             Next.js researcher dashboard
  persona/        Full persona runtime (AXL + 0G + Compute)
  moderator/      Turn-taking driver for focus-group sessions
  synthesizer/    Post-session clustering + report writer
  harness/        App-under-test connector (screenshot → observation)
  orchestrator/   Session orchestrator
  cli/            cortex CLI entry point
infra/
  axl/            AXL binary, ed25519 keys, node configs, spawn.sh
  deploy/         addresses.json, Fly.toml, start-stack.mjs
```

---

## Hard Invariants (never violated)

1. **No central broker for agent comms.** All inter-agent chat via AXL A2A.
2. **All inference via 0G Compute.** `verifiedReason()` calls `broker.inference.processResponse()` on every reply.
3. **Brains always AES-256 encrypted before 0G upload.** Plaintext upload = bug.
4. **Testnet Galileo only.** ChainId 16602.
5. **No hardcoded contract addresses.** Read from `infra/deploy/addresses.json`.

---

## Proof Links

- **iNFT contract:** https://explorer.0g.ai/testnet/blockchain/accounts/0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B/transactions
- **OffchainResolver:** https://explorer.0g.ai/testnet/blockchain/accounts/0xaB32d4b316bE27cE47fCbf92A321f24B22c49121/transactions
- **Known mint tx:** https://explorer.0g.ai/testnet/blockchain/txns/0x06482bfd93b50bd7ec5e2b1cb95c0de759ea4d68c9dac6c8fee0497eea7fde1b/overview

