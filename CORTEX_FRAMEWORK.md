# Cortex — Decentralized Agent Framework

Cortex is a framework for building persistent, self-evolving agent twins. Inspired by OpenClaw but fully decentralized: agent brains live on 0G Storage, every response is TeeML-sealed (provably computed), identities are iNFTs on Galileo, and messaging is P2P via AXL. No central brokers. No unverified inference.

## Quick Start

### Prerequisites
- Node 22+, pnpm
- 0G testnet account funded via https://faucet.0g.ai
- `.env` with `PRIVATE_KEY=0x...`

### Run Protocol Agents Demo (5 min)

```bash
# 1. Start AXL cohort (3 nodes)
bash infra/axl/spawn.sh 3

# 2. Spawn protocol twins (zerog/axl/ens with skill auto-selection)
pnpm -F @cortex/protocol-twins start

# 3. In another terminal: test HTTP ask (implicit interface)
curl -s http://localhost:9013/ask -X POST -H "Content-Type: application/json" \
  -d '{"message":"How do I set up 0G KV locally?"}' | jq .

# 4. Run full demo (ENS → HTTP → AXL cross-query)
pnpm tsx demo/03-protocol-agents.ts

# 5. Mint agents as iNFTs (optional)
pnpm -F @cortex/protocol-twins mint
```

## Architecture

### Five Core Components

| Component | Layer | Purpose | Tech |
|-----------|-------|---------|------|
| **Brain Storage** | Persistence | Agent knowledge (encrypted/plaintext) | 0G Storage (AES-256 + content-addressing) |
| **Identity** | Discovery | Durable agent name + metadata | ENS subname + CCIP-read gateway |
| **Ownership** | Verification | On-chain proof of agent | ERC-7857 iNFT on Galileo |
| **Messaging** | P2P | Inter-agent dialogue | AXL (Yggdrasil mesh, no broker) |
| **Inference** | Computation | Verified reasoning | 0G Compute (Qwen 2.5 7B + TeeML seal) |

### Brain Lifecycle

```
[Local Files] ──→ [Create Brain JSON]
     ↓                    ↓
[Profile Context]   [Load Skills]
[Style Guide]   ─→  [Serialize]
                      ↓
              [Upload to 0G Storage]
                      ↓
              [Get rootHash]
                      ↓
         [Register ENS agent.resume]
                      ↓
            [Mint ERC-7857 iNFT]
                      ↓
    [Brain is discoverable + owned]
                      ↓
         [Every interaction logs episodic event]
                      ↓
      [Every N events: consolidateMemory]
                      ↓
         [Re-upload new brain to 0G]
                      ↓
       [Update ENS agent.resume pointer]
                 (cycle repeats)
```

## Core APIs

### Creating an Agent

```typescript
import { Agent } from '@cortex/kit';

const twin = await Agent.create({
  name: 'zerog-builder',
  ensName: 'zerog-builder.cortex.eth',
  protocol: '0G',
  mission: 'Help builders integrate 0G Storage...',
  skills: [{ name: 'zerog-recipes', ... }],
  visibility: 'public', // or 'private' → encrypted upload
}, { axlApiUrl: 'http://127.0.0.1:9002' });
```

### Discovering an Agent

```typescript
import { resolveAgentEns } from '@cortex/kit';

const record = await resolveAgentEns('zerog-builder.cortex.eth');
console.log(record.texts['agent.resume']); // → 0g://Qm...
console.log(record.texts['agent.axl_peer']); // → ed25519 pubkey
```

### Querying an Agent

**AXL (P2P):**
```typescript
const msg = {
  type: 'query',
  from: 'requester',
  question: 'How do I set up KV locally?',
  requestId: `req-${Date.now()}`,
};
await axl.send(targetPeerId, msg);
```

**HTTP (Implicit):**
```bash
curl -X POST http://localhost:9013/ask \
  -H "Content-Type: application/json" \
  -d '{"message":"How do I set up KV locally?"}'
```

Response: `{ answer: "...", verified: true, skill: "zerog-recipes", from: "zerog-builder" }`

### Agent Text Record Schema

```typescript
{
  'agent.inft': '0x1f45C631...:42',              // contract:tokenId
  'agent.axl_peer': 'ed25519pubkey...',          // P2P identity
  'agent.resume': '0g://Qm...',                  // brain rootHash
  'agent.protocol': '0G',                         // expertise domain
  'agent.memory.episodic': '0gkv://stream...',  // event log
  'agent.target_market': 'builders',             // discovery filter
  'agent.session_count': '7',                    // interaction count
  'agent.framework': 'persistent-agent-kit',    // version
}
```

## Skill Packs (Protocol Bodies)

Agents auto-select skills based on natural language matching. Each skill pack lives in `.claude/skills/{name}/SKILL.md`:

- **zerog-recipes** — 0G Storage/Compute SDK patterns, KV setup, TeeML verification
- **spawn-axl-cohort** — AXL node bootstrap, SwarmMsg types, peer mesh
- **ens-subname-issue** — CCIP-read flow, ENS gateway, signature verification
- **apply-twin-patterns** — HTTP server, KV state, episodic memory, self-evolution
- **mint-persona** — iNFT minting, encryption, storage upload

Skills are loaded via `loadSkillDirectory()` and matched via `selectSkillsForTask()`. Selected skills' instructions are prepended to the LLM prompt before `verifiedReason()`.

## Three Protocol Agents

The framework ships with three canonical example agents:

### zerog-builder
- **Protocol**: 0G Storage, 0G Compute, iNFT
- **Skills**: zerog-recipes, mint-persona, apply-twin-patterns
- **Mission**: Help builders implement 0G integration patterns with testnet-safe guidance
- **HTTP Port**: 9013
- **Boundaries**: TeeML verification mandatory, Galileo testnet only, local KV encouraged

### axl-builder
- **Protocol**: AXL P2P mesh, A2A routing, MCP-over-AXL
- **Skills**: spawn-axl-cohort, run-focus-session, apply-twin-patterns
- **Mission**: Design decentralized agent swarms on Yggdrasil mesh
- **HTTP Port**: 9023
- **Boundaries**: No central brokers, unique ed25519 keys per node, SwarmMsg types strict

### ens-builder
- **Protocol**: ENS CCIP-read, offchain resolution, agent discovery
- **Skills**: ens-subname-issue, apply-twin-patterns, mint-persona
- **Mission**: Give agents durable ENS identities with text record discovery
- **HTTP Port**: 9033
- **Boundaries**: CCIP signature verification mandatory, agent.resume is brain pointer, parent resolver on L1

## Demo Flow

**demo/03-protocol-agents.ts** shows the full stack:

1. **Phase 1: ENS Resolution** — Query `cortex.eth` gateway, resolve 3 agents → peer IDs + protocols
2. **Phase 2: HTTP Ask** — POST natural language questions, get TeeML-verified answers with skill attribution
3. **Phase 3: AXL P2P** — zerog-builder queries ens-builder cross-agent via Yggdrasil mesh
4. **Phase 4: Summary** — All 5 components working (storage + identity + ownership + messaging + inference)

```bash
pnpm tsx demo/03-protocol-agents.ts
```

## Deployment

### For hackathons / quick demos:
```bash
# Local only (no on-chain)
bash infra/axl/spawn.sh 3
pnpm -F @cortex/protocol-twins start
pnpm tsx demo/03-protocol-agents.ts
```

### For production:
1. Deploy `MintPersona.sol` contract on Galileo
2. Update `packages/protocol-twins/src/mint-twins.ts` with contract address
3. Set `cortex.eth` resolver to `OffchainResolver` contract on L1 ENS
4. Run `pnpm -F @cortex/protocol-twins mint`
5. Agents are now discoverable via ENS + ownable as iNFTs

## Skill Pack Template

Create a new skill by adding `.claude/skills/{name}/SKILL.md`:

```yaml
---
name: my-skill
description: One-line description. Triggers on: "keyword1", "keyword2".
---

# my-skill

Detailed documentation. This markdown is loaded and appended to LLM prompts.

## When to use

Context for when this skill should be auto-selected.

## Example code

```typescript
// Copy-paste recipe
```

## Gotchas

- Key insight 1
- Key insight 2
```

Skills are auto-loaded at agent startup and matched via `selectSkillsForTask()`. Top 3 matching skills are included in the prompt.

## Configuration

**.env:**
```bash
PRIVATE_KEY=0x...                    # Wallet for 0G operations
ZG_RPC_URL=https://evmrpc-testnet.0g.ai
ZG_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ZG_KV_NODE_URL=http://3.101.147.150:6789   # Or localhost:6789 for local zgs_kv
ZG_COMPUTE_PROVIDER=0xa48f01...    # Qwen provider on testnet
ZG_COMPUTE_MODEL=qwen/qwen-2.5-7b-instruct
```

**.env.local** (dev override):
```bash
ZG_KV_NODE_URL=http://127.0.0.1:6789  # Use local zgs_kv
```

**Environment variables:**
- `SKILL_DIR` — where to load skill packs (default: `.claude/skills`)
- `HTTP_PORT` — port for HTTP /ask (default: 9013 + slotIndex*10)
- `AXL_BASE_PORT` — base AXL api port (default: 9002)
- `AXL_PORT_STRIDE` — port spacing per node (default: 10)

## Invariants

The framework enforces these non-negotiable guarantees:

1. **All inference is TeeML-verified.** Every `verifiedReason()` call throws if `result.verified !== true`.
2. **No central message broker.** All inter-agent messaging goes through AXL P2P or HTTP.
3. **Agent brains are always encrypted before upload** (unless explicitly `visibility: 'public'`).
4. **Testnet Galileo only.** Never use mainnet 0G or mainnet ETH for demos.
5. **No hardcoded addresses.** Read contract addresses from `infra/deploy/addresses.json`.
6. **Stream IDs are deterministic.** Derived from keccak256(label), not random.
7. **ENS agent.resume points to latest brain.** Updated on every `agent.save()`.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `KV read timeout` | Public node slow | Use local `zgs_kv` via `.env.local` |
| `invalid BytesLike value` | Stream ID wrong length | Ensure padStart(64, '0') |
| `OffchainLookup` in viem | Parent resolver not set | Set cortex.eth resolver to OffchainResolver on L1 |
| `MCP register failed` | AXL router port wrong | Check `AXL_MCP_URL` env var |
| `query not received` | Peer topology not mesh | Wait 2s after AXL node boots |

## References

- **0G Docs**: `../0g-doc/docs/developer-hub/`
- **AXL Docs**: `../0g-doc/axl/docs/`
- **iNFT Spec**: https://github.com/0gfoundation/0g-agent-nft (eip-7857-draft branch)
- **ENS CCIP-read**: https://docs.ens.domains/resolvers/ccip-read
- **OpenClaw**: https://openclaw.ai/ (inspired by this)

## What's Next

- [ ] Multi-twin focus group orchestration (moderator + personas)
- [ ] Brain evolution → on-chain verification
- [ ] Marketplace for skill discovery
- [ ] Cross-chain agent identity (not just Galileo)
- [ ] Real-time collaborative reasoning (agents debating)

## License

MIT (cortex framework)
Apache 2.0 (0G SDK)
MIT (AXL, ENS)
