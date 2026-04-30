# focus-swarm

## Pivot: Persistent Agent Kit

This repo now includes **Persistent Agent Kit** (`packages/kit`): a framework for building durable AI agents with installable skills, persistent memory, ENS identity, AXL peer-to-peer collaboration, and verified 0G Compute reasoning.

The flagship example is **Protocol Twins**: three specialist agents for 0G, AXL, and ENS that help builders integrate those protocols together. Run the judge-facing dry demo with:

```bash
pnpm e2e:kit
```

The original focus-swarm app remains as an example of agents built on the same protocol primitives.

**Synthetic focus-group agent swarm** on 0G + Gensyn AXL + ENS.

A researcher specifies a target market and a product. The system spawns archetype-driven persona agents — each with a generated life story, values, and verifiable LLM brain. Personas hold a moderated focus-group session over a peer-to-peer mesh. A synthesizer writes a clustering report (themes, pain points, contradictions, opportunity scoring). Personas persist across sessions as iNFTs whose memory grows; researcher cohorts can be rented out.

## What's onchain / verifiable
- **Persona brain** — JSON spec (life story, values, traumas, media diet, comms style) AES-256 encrypted client-side, uploaded to 0G Storage. Plaintext never leaves the host.
- **Persona ownership** — minted as ERC-7857 (`MintPersona.sol`). `encryptedURI` = 0G Storage rootHash, `metadataHash` = keccak256 of the spec.
- **Persona memory** — 0G Storage KV (mood, current opinion vector) + Log-on-KV (utterance history). Streams keyed `persona:<tokenId>:state` and `persona:<tokenId>:log`.
- **Inference** — every reply runs through 0G Compute (`broker.inference.processResponse()` — TeeML verification). Persona refuses to broadcast unverified replies.
- **Inter-persona dialogue** — every persona is its own AXL node (own ed25519 identity, own ports). Moderator and personas communicate by `POST /send` + `GET /recv` over the encrypted Yggdrasil mesh. **No central message broker.**
- **Identity** — every persona resolves at `<archetype>.cohort-<n>.focusgroup.eth` with text records: `agent.inft`, `agent.axl_peer`, `agent.archetype`, `agent.resume`, `agent.last_session`. Self-hosted CCIP-read offchain resolver (free, ENSv2-ready).

## Architecture

```
[UI / Next.js] ──POST /api/sessions──▶ [Orchestrator]
                                            │
              ┌─────────────────────────────┴─────────────────────────────┐
              ▼                                                            ▼
   [Smith × N personas]                                           [bash spawn.sh N]
   chat (TeeML) → encrypt → upload → mint → ENS register     boot N+1 AXL nodes
              │                                                            │
              └────────────────────────┐                                   │
                                       ▼                                   ▼
                          [Persona runtime × N]                  [Moderator runtime]
                          subscribe /recv on own AXL node        /send turn msgs
                          on turn: read 0G KV, RAG 0G Log,        round-robin speaker
                          chat (TeeML), append Log, broadcast     collect transcript
                          utterance to all peer nodes
                                       │
                                       ▼
                          [Synthesizer] reads transcript, runs verified clustering,
                          uploads report to 0G Storage, returns full result to UI
```

## Tracks targeted

### 🤖 0G Autonomous Agents, Swarms & iNFT Innovations
- **Multi-agent swarm** — moderator + N personas + harness, each with its own runtime, inference, memory.
- **iNFT (ERC-7857)** — `packages/contracts/contracts/MintPersona.sol`. Mint-only path; transfer-time TEE re-encryption oracle out of scope for hackathon.
- **Persistent verifiable memory** — `packages/core/src/storage.ts` exposes `kvSet/kvGet/logAppend/logRead` over 0G Storage with auto-derived stream IDs.
- **TeeML inference** — `packages/core/src/compute.ts` calls `processResponse()` after every chat — `chat()` throws if verification fails or returns `verified: false`.

### 🛰️ Gensyn AXL — Peer-to-peer
- **Distinct AXL nodes** — `infra/axl/spawn.sh` boots 1 moderator + N persona nodes, each with its own ed25519 identity, distinct host ports (`api 9002+i*10`, `tls 9101+i*10`, `mcp 9003+i*10`, `a2a 9004+i*10`).
- **Real cross-node traffic** — `packages/core/src/axl.ts` (`AxlClient`, `pumpRecv`, `SwarmMsg` envelope). Personas send/receive via `POST /send` + `GET /recv`; no central broker, no Redis, no NATS.
- **Track requirement satisfied** — communication crosses separate AXL processes, not just in-process. `peers.local.json` proves N+1 distinct pubkeys.

### 🪪 ENS for AI Agents
- **Subname-per-persona** — `<archetype>.cohort-<n>.focusgroup.eth`.
- **Real records** — iNFT pointer, AXL peer ID, archetype, encrypted-resume URI, last-session report URI.
- **Self-hosted CCIP-read gateway** — `packages/ens-gateway/`. Express + SQLite. Parent's L1 resolver delegates here via EIP-3668 wildcard; subnames are free DB writes.
- **Resolves via stock viem** — `client.getEnsText({ name, key: 'agent.inft' })` works without library mods.

> Note: full EIP-3668 signed callback (`/ccip/:sender/:data`) is stubbed; the data-layer and resolution flow are functional via the `/lookup` HTTP path. Wiring the ECDSA-signed offchain response is the last polish item.

## Quick start

### Prereqs
- Node 22, pnpm 9, Go 1.22+, openssl, sqlite3, jq
- A wallet funded via https://faucet.0g.ai (chain 16602)

### 1. Build & install
```bash
pnpm install
# Build the AXL binary from the docs repo
(cd ../0g-doc/axl && make build && cp ./node ../../focus-swarm/infra/axl/bin/node)
# Compile contracts
pnpm -F @focus-swarm/contracts compile
```

### 2. Configure
```bash
cp .env.example .env
# put your funded testnet PRIVATE_KEY into .env (NOT .env.example)
```

### 3. Smoke 0G stack
```bash
pnpm smoke:storage        # encrypted upload + KV r/w + Log roundtrip
pnpm smoke:compute        # Qwen 2.5 7B + TeeML processResponse() must return true
```

### 4. Deploy iNFT contract
```bash
pnpm deploy:contracts
# writes infra/deploy/addresses.json
```

### 5. Run ENS gateway (separate terminal)
```bash
pnpm -F @focus-swarm/ens-gateway dev
```

### 6. Run a session
**Headless (CLI):**
```bash
TARGET_MARKET="Gen-Z renters in Berlin who use BeReal" \
PRODUCT_BRIEF="A subscription habit tracker that auto-snaps your habits" \
ARCHETYPES="genz-renter-berlin,solo-founder-mumbai,boomer-dad-houston" \
pnpm -F @focus-swarm/orchestrator run
```

**Via UI:**
```bash
pnpm ui          # http://localhost:3000
```

Output of either run: persona iNFT tokenIds + ENS names + transcript JSON + report JSON, with rootHashes for the on-storage versions.

## Skills (`.claude/skills/`)
Each skill teaches Claude how to do one operation end-to-end:
- `spawn-axl-cohort` — boot N AXL nodes
- `mint-persona` — encrypt → upload → mint → ENS register
- `run-focus-session` — full session orchestration
- `zerog-recipes` — copy-paste 0G storage/compute snippets
- `ens-subname-issue` — gateway POST + viem resolve

## Layout
```
packages/
  contracts/      Hardhat — MintPersona.sol (ERC-7857 mint-only)
  core/           0G SDK wrappers (storage, compute, identity) + AXL client
  ens-gateway/    CCIP-read offchain resolver gateway (Express + SQLite)
  smith/          Persona generator + iNFT mint pipeline
  persona/        Persona runtime (one process per AXL node)
  moderator/      Turn-taking + transcript collection
  harness/        Pushes product observations into the swarm
  synthesizer/    Verified clustering + report
  orchestrator/   Full session lifecycle (used by UI + CLI)
  ui/             Next.js researcher dashboard
infra/
  axl/            AXL binary, per-node configs, ed25519 keys, spawn.sh, peers.local.json
  deploy/         Contract addresses, ENS gateway DB, session reports
.claude/
  settings.local.json
  skills/         Repo-local Claude skills
CLAUDE.md         Project invariants (no central broker, all inference via 0G Compute, etc)
```

## Submission metadata
- **Project name** — focus-swarm
- **Network** — 0G testnet Galileo (chain 16602)
- **Contract** — see `infra/deploy/addresses.json` after deploy
- **iNFT explorer** — `https://chainscan-galileo.0g.ai/address/<MintPersona>`
- **Demo** — see `packages/ui/` and CLI commands above

## Hard invariants
1. No central message broker between agents — AXL only.
2. All inference via 0G Compute, TeeML-verified. No OpenAI/Anthropic fallback.
3. Persona brains always encrypted before upload.
4. Testnet only.

These are enforced in `CLAUDE.md`, in code (chat throws on `!verified`, persona drops unverified replies), and in `.claude/settings.local.json` (denies `* mainnet *` patterns).
