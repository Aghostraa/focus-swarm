# Cortex Framework Demo Checklist

## What Was Built

### 1. Enriched Skill Packs (Protocol Bodies) ✓
- **zerog-recipes** — Full KV/storage SDK patterns, stream ID format (padStart 64), .env.local override, Batcher(3) replication, local zgs_kv setup (cmake/protoc workarounds), testnet config
- **spawn-axl-cohort** — SwarmMsg types union, A2A query/answer with requestId, MCP-over-AXL, port schema (api=9002+i*10, router=9003+i*10), pumpRecv timeout + abort patterns, failure modes
- **ens-subname-issue** — CCIP-read EIP-3668 flow (OffchainLookup → gateway → resolveWithProof), agent text record schema, signature verification format (keccak256(0x1900 || ...)), viem integration, registerAgentEns() usage
- **apply-twin-patterns** (NEW) — HTTP MCP server pattern, KV state (setAgentState/getAgentState), profile init from local files, TeeML tools (verifiedReason mandatory), implicit skill selection (selectSkillsForTask), episodic memory (appendIntegrationEvent), evolution trigger (every N events)

### 2. Protocol Twin Runtime Upgrades ✓
- **Skill auto-loading** — loadSkillDirectory(.claude/skills), filter to config.skills array
- **Implicit skill selection** — selectSkillsForTask() matches natural language to skill triggers
- **Enriched system prompt** — buildSkillPrompt() prepends selected skill instructions
- **HTTP /ask server** — Natural language interface (POST /ask {message, context?} → {answer, verified, skill})
- **Ports** — HTTP on 9013 + slotIndex*10 (zerog=9013, axl=9023, ens=9033)
- **Interaction counter** — Track conversations, fire evolution trigger every 10 (placeholder for consolidateMemory)

### 3. Twin Agent Configs Updated ✓
- **zerog-builder** — Mission: 0G Storage/Compute expert with KV + replication + TeeML expertise; Boundaries: stream ID format, fail-closed on verification, testnet only, local KV encouraged; Skills: zerog-recipes, mint-persona, apply-twin-patterns
- **axl-builder** — Mission: Decentralized P2P swarms with Yggdrasil mesh expertise; Boundaries: no central brokers, unique ed25519 keys, SwarmMsg strict types, requestId correlation; Skills: spawn-axl-cohort, run-focus-session, apply-twin-patterns
- **ens-builder** — Mission: Agent identity via CCIP-read ENS subdomains; Boundaries: signature verification mandatory, agent.resume is brain pointer, parent resolver on L1, durable metadata; Skills: ens-subname-issue, apply-twin-patterns, mint-persona

### 4. iNFT Minting Script ✓
**packages/protocol-twins/src/mint-twins.ts**
- Load agent configs + skills
- Create brain JSON (identity + skills + memory structure)
- Upload plaintext brain to 0G Storage → get rootHash
- Mint ERC-7857 token on Galileo (contract: 0x1f45C631...)
- Extract tokenId from mint event
- Register ENS subname with agent.inft + agent.resume + agent.protocol
- Write protocol-twins-manifest.json (tokenIds + rootHashes + tx hashes)

Added `pnpm -F @cortex/protocol-twins mint` script.

### 5. Full Demo Script ✓
**demo/03-protocol-agents.ts** — Five components in action:
- **Phase 1** — ENS resolution: query cortex.eth gateway, discover 3 agents (peer IDs + protocols)
- **Phase 2** — HTTP ask: zerog/axl/ens answer different questions with skill attribution + TeeML seal
- **Phase 3** — AXL P2P: zerog-builder queries ens-builder cross-agent via Yggdrasil mesh
- **Phase 4** — Framework summary (0G Storage + ENS + iNFT + AXL + 0G Compute)

## How to Run

### Quick Demo (no on-chain, 5 min)

```bash
# Terminal 1: Start local AXL cohort
bash infra/axl/spawn.sh 3

# Terminal 2: Spawn protocol twins
pnpm -F @cortex/protocol-twins start

# Terminal 3: Test HTTP implicit ask
curl -X POST http://localhost:9013/ask \
  -H "Content-Type: application/json" \
  -d '{"message":"How do I set up 0G KV locally?"}'

# Terminal 3: Run full demo
pnpm tsx demo/03-protocol-agents.ts
```

### Production Demo (with iNFT mint)

```bash
# Prerequisites:
# 1. Have testnet 0G (from faucet.0g.ai)
# 2. Set PRIVATE_KEY in .env

# 1. Start AXL + twins (same as above)
bash infra/axl/spawn.sh 3
pnpm -F @cortex/protocol-twins start

# 2. Mint agents as iNFTs
pnpm -F @cortex/protocol-twins mint
# → Outputs protocol-twins-manifest.json with tokenIds + brain rootHashes

# 3. Verify on-chain
# Check Galileo explorer: chainscan-galileo.0g.ai
# Search for MintPersona contract: 0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B

# 4. Run full demo
pnpm tsx demo/03-protocol-agents.ts
```

## What Each Agent Does

### zerog-builder (Port 9013)
```bash
curl -X POST http://localhost:9013/ask -d '{"message":"How do I set up 0G KV locally?"}'
→ Returns KV setup guide with zerog-recipes skill selected + TeeML verified
```

### axl-builder (Port 9023)
```bash
curl -X POST http://localhost:9023/ask -d '{"message":"How do I spawn an AXL cohort?"}'
→ Returns AXL bootstrap guide with spawn-axl-cohort skill selected + verified
```

### ens-builder (Port 9033)
```bash
curl -X POST http://localhost:9033/ask -d '{"message":"What text records should my agent have?"}'
→ Returns ENS record schema with ens-subname-issue skill selected + verified
```

## How It Works

### Agent Discovery (ENS)
1. Query ENS gateway for `zerog-builder.cortex.eth`
2. Get text records: `agent.axl_peer`, `agent.resume`, `agent.protocol`
3. agent.resume points to 0G Storage brain rootHash
4. agent.axl_peer is ed25519 pubkey for P2P messaging

### Skill Auto-Selection
1. Agent receives natural language question
2. `selectSkillsForTask(agentSkills, question)` scores all skills by trigger match
3. Top 3 skills selected
4. `buildSkillPrompt(selected, question)` formats skill instructions + task
5. System prompt + boundaries + skill-enriched user prompt sent to `verifiedReason()`
6. 0G Compute returns answer + TeeML seal
7. Agent logs interaction to episodic memory

### Evolution (Every 10 Interactions)
1. Interaction counter increments
2. Every 10th interaction fires evolution trigger (currently logging only)
3. Full evolution would: consolidateMemory() → re-upload brain → update ENS agent.resume
4. New brain rootHash persists across sessions

## Test Scenarios

### Scenario 1: New user asks zerog-builder
```bash
# Terminal A: zerog-builder running
# Terminal B:
curl -X POST http://localhost:9013/ask -d '{
  "message": "How do I encrypt and upload data to 0G Storage?",
  "context": "I am building an agent brain"
}'
# Expected: TeeML-verified answer mentioning AES-256 encryption, Batcher, rootHash
# Skill: zerog-recipes
```

### Scenario 2: Cross-agent relay (AXL)
```bash
# Terminal A: All three agents running (via spawn.ts)
# Terminal B: demo/03-protocol-agents.ts
# Expected: zerog-builder sends AXL query to ens-builder
#           ens-builder answers with CCIP-read explanation
#           zerog-builder receives answer with requestId correlation
```

### Scenario 3: iNFT ownership verification
```bash
# After running mint script:
curl https://chainscan-galileo.0g.ai/api/v2/smart-contracts/0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B/methods-read?address=0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B
# Find MintPersona.ownerOf(tokenId) → wallet address
# Find MintPersona.encryptedURI(tokenId) → 0G Storage rootHash
```

## Success Criteria

- [ ] All 3 agents start (zerog/axl/ens)
- [ ] ENS resolution returns agent text records
- [ ] HTTP /ask returns verified answer with skill attribution
- [ ] AXL query/answer completes with requestId correlation
- [ ] Demo 03 runs all 4 phases without error
- [ ] iNFT mint succeeds (optional, requires testnet 0G)
- [ ] ENS subnames are queryable via viem
- [ ] Manifest.json shows tokenIds + rootHashes

## Hackathon Submission Checklist

- [x] Three protocol expert agents (zerog/axl/ens) fully implemented
- [x] Skill packs with real protocol documentation (zerog-recipes, spawn-axl-cohort, ens-subname-issue, apply-twin-patterns)
- [x] HTTP /ask implicit interface (no MCP schema, natural language)
- [x] AXL P2P messaging (SwarmMsg types, query/answer with correlation)
- [x] iNFT minting script (ERC-7857 on Galileo)
- [x] ENS integration (CCIP-read gateway, agent text records)
- [x] 0G Compute integration (TeeML-verified inference via Qwen)
- [x] Full demo showing all 5 components
- [x] Skill auto-selection from natural language
- [x] Framework documentation (CORTEX_FRAMEWORK.md)
- [x] Public GitHub repo (focus-swarm)
- [x] All skills/code in `.claude/skills/` and `packages/`

## Known Limitations

- Evolution trigger currently logs only (consolidateMemory not called)
- iNFT brain update is write-once (on-chain doesn't track re-uploads, only ENS does)
- Local zgs_kv required for optimal demo (public node at 3.101.147.150:6789 is fallback)
- CCIP-read requires cortex.eth parent resolver set on L1 (off-chain action)

## Next Steps for Production

1. Enable evolution: consolidateMemory() → re-upload → update ENS
2. Implement on-chain brain update (ERC-7857 full compliance with re-encryption)
3. Multi-agent focus group orchestration (moderator + persona interaction)
4. Skill marketplace (discovery + payment for skill packs)
5. Cross-chain identity (not just Galileo)
