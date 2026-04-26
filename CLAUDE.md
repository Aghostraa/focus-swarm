# focus-swarm

Synthetic focus-group agents. Researcher specifies target market → swarm of archetype-driven personas spawns, holds moderated session, synthesizer reports findings. Personas persist across sessions as iNFTs with growing memory.

## Tracks targeted
- **0G Autonomous Agents** — primary
- **Gensyn AXL** — peer-to-peer dialogue layer between personas
- **ENS for AI Agents** — persona identity + discovery via subnames

## Hard invariants
1. **No central message broker for agent comms.** All inter-persona chat goes through AXL A2A/MCP. Violates Gensyn track if broken.
2. **All inference via 0G Compute.** No OpenAI / Anthropic fallback in persona runtime. TeeML verification must run via `broker.inference.processResponse()` on every reply.
3. **Persona brains always encrypted before upload to 0G Storage.** AES-256 default. Plaintext upload is a bug.
4. **Testnet Galileo only.** Never spend mainnet 0G or mainnet ETH.
5. **No hardcoded contract addresses.** Read from `infra/deploy/addresses.json`.

## Network — testnet Galileo
- Chain ID: 16602
- RPC: `https://evmrpc-testnet.0g.ai`
- Faucet: `https://faucet.0g.ai`
- Storage indexer (turbo): `https://indexer-storage-testnet-turbo.0g.ai`
- Explorer: `https://chainscan-galileo.0g.ai`

## Layout
```
packages/
  contracts/      Hardhat — mint-only ERC-7857 fork
  core/           0G SDK wrappers (storage, compute, identity)
  ens-gateway/    CCIP-read offchain resolver (Express + SQLite)
  smith/          Persona generator (archetype → mint → ENS register)
  persona/        Persona runtime — AXL node + 0G memory + Compute inference
  moderator/      Turn-taking driver over AXL A2A
  harness/        App-under-test connector (URL/screenshot → observation feed)
  synthesizer/    Post-session clustering + report writer
  ui/             Next.js researcher dashboard
infra/
  axl/            Per-node configs, ed25519 keys, AXL binary, spawn.sh
  deploy/         addresses.json, env templates
```

## Conventions
- pnpm workspaces. Run from repo root: `pnpm -F <pkg> <script>`.
- Each package has `scripts/smoke.ts` that hits testnet for end-to-end check before integration.
- Persona ENS: `<archetype-slug>.cohort-<n>.focusgroup.eth`.
- Persona iNFT tokenId = derived from cohort+slot index (deterministic).
- AXL ports per node: api=`9002+i`, mcp=`9003+i`, a2a=`9004+i` (i = slot in cohort).

## Don't
- Commit `.env`, `infra/axl/keys/*.pem`, `infra/deploy/*.local.json`.
- Add OpenAI/Anthropic SDK packages (would silently break invariant #2).
- Use `axios`/REST polling between personas instead of AXL (breaks invariant #1).
- Mint to mainnet.

## Skills (in `.claude/skills/`)
- `spawn-axl-cohort` — bring up N AXL nodes with mesh
- `mint-persona` — encrypt brain → upload 0G → mint iNFT → register ENS
- `run-focus-session` — orchestrate full session
- `zerog-recipes` — copy-paste 0G storage/compute snippets w/ doc refs
- `ens-subname-issue` — gateway POST + viem resolve roundtrip

## Verification protocol
Order matters. Don't skip ahead.
1. `pnpm -F core smoke:storage` — encrypted upload+download roundtrip
2. `pnpm -F core smoke:compute` — Qwen chat + TeeML `processResponse()` returns true
3. `pnpm -F contracts deploy:testnet` — write addr to `infra/deploy/addresses.json`
4. `bash infra/axl/spawn.sh 4 && curl :9002/topology` — 3 peers visible per node
5. `pnpm -F smith mint --archetype=...` — returns tokenId + ensName, both resolvable
6. `pnpm -F ui dev` — full session demo

## References
- 0G docs in `../0g-doc/docs/developer-hub/`
- AXL docs in `../0g-doc/axl/docs/`
- iNFT reference: `https://github.com/0gfoundation/0g-agent-nft` branch `eip-7857-draft`
- ENS offchain registrar pattern: `gskril/ens-offchain-registrar`
