# Architecture

## Overview

Cortex is a two-layer framework:

- **`@cortex/core`** — thin wrappers over 0G Storage, 0G Compute, 0G KV, and the AXL HTTP bridge
- **`@cortex/kit`** — agent primitives built on core: brain load/save, skill packs, episodic memory, ENS identity, verified inference

Agents are processes that boot `@cortex/kit`, register an ENS subname, connect to an AXL node, and expose an HTTP API. They call `verifiedReason()` for every inference — no direct OpenAI/Anthropic calls anywhere.

---

## Data Flow: Single Agent Turn

```
Incoming query (HTTP or AXL SwarmMsg)
    │
    ▼
selectSkillsForTask(agentSkills, question, 3)
    │  keyword scoring against loaded .md skill packs
    ▼
buildSkillPrompt(selectedSkills, question)
    │  injects skill context into prompt
    ▼
verifiedReason(messages)          ← @cortex/kit
    │
    ▼
chat(messages)                    ← @cortex/core
    │
    ▼
broker.inference.processResponse()  ← @0glabs/0g-serving-broker
    │  TeeML verification
    ▼
{ text, verified: true/false, chatId, provider, model }
    │
    ├─ appendIntegrationEvent()   ← write to 0G KV episodic log
    │
    └─ return answer to caller
```

---

## Data Flow: Brain Evolution

```
POST /evolve { failureMessage }
    │
    ├─ appendIntegrationEvent(outcome: 'failed', error: failureMessage)
    │     writes to 0G KV episodic stream
    │
    ├─ evolveSkills(agentName, skills, skillDir, { directGaps: [failureMessage] })
    │     │
    │     ├─ verifiedReason(prompt: "update skill for gap: <failureMessage>")
    │     │     calls 0G Compute, TeeML verified
    │     │
    │     ├─ write updated .md to skillDir (with .bak backup)
    │     │
    │     └─ uploadEncrypted(bundle, sha256("cortex-brain:<agentName>"))
    │           AES-256 encrypt → 0G Storage Indexer
    │           returns { rootHash, txHash, txSeq }
    │
    └─ return { evolved, skillsUpdated, newBrainHash, reason }
```

---

## Data Flow: ENS Identity

```
Agent boots
    │
    ├─ axl.myPubkey()              get Yggdrasil public key from AXL node
    │
    ├─ registerAgentEns({
    │     ensName: "zerog-builder.cortex.eth",
    │     texts: {
    │       "agent.protocol":  "0G",
    │       "agent.axl_peer":  "<pubkey>",
    │       "agent.resume":    "0g://<brainRootHash>",
    │       "agent.framework": "persistent-agent-kit",
    │     }
    │   })
    │
    └─ POST http://localhost:8787/set   ← ENS gateway
         │
         └─ SQLite upsert (name, addr, texts)
         
Later, when another agent resolves this name:
    resolveAgentEns("zerog-builder.cortex.eth")
        → GET /lookup/zerog-builder.cortex.eth
        → { texts: { "agent.axl_peer": "<pubkey>", ... } }
        → axl.send(pubkey, peerQuery)
```

---

## Data Flow: AXL Peer Discovery + Query

```
zerog-builder project starts
    │
    ├─ resolveAgentEns("axl-builder.cortex.eth")
    │     returns texts["agent.axl_peer"] = axlPubkey
    │
    ├─ axl.send(axlPubkey, {
    │     type: "peer_query",
    │     projectId, from, question, requestId
    │   })
    │     POST /send with X-Destination-Peer-Id: axlPubkey
    │     AXL routes through Yggdrasil mesh
    │
    └─ axl-builder receives via pumpRecv()
         onMessage({ type: "peer_query" }, fromPeer)
              │
              └─ verifiedReason() → axl.send(fromPeer, { type: "peer_answer", ... })
```

---

## Package Dependency Graph

```
@cortex/core
  ├── @0gfoundation/0g-ts-sdk    (Storage)
  ├── @0glabs/0g-serving-broker  (Compute)
  └── ethers

@cortex/kit
  └── @cortex/core

@cortex/protocol-twins
  ├── @cortex/kit
  └── @cortex/core

@cortex/apply
  ├── @cortex/kit
  └── @cortex/core

@cortex/smith
  ├── @cortex/kit
  └── @cortex/core

@cortex/ens-gateway
  ├── better-sqlite3
  └── viem

@cortex/demo-gateway
  └── express

@cortex/ui
  └── next
```

---

## AXL Node Mesh

Each agent process runs next to its own AXL node. Port scheme (i = slot index):

| Purpose | Port |
|---------|------|
| TLS listener (Yggdrasil peer) | `9101 + i*10` |
| HTTP API bridge | `9002 + i*10` |
| MCP router | `9003 + i*10` |
| A2A server | `9004 + i*10` |

Node 0 is the bootstrap peer. All others connect to `tls://127.0.0.1:9101`.

The `AxlClient` in `@cortex/core` only talks to the HTTP bridge (`/topology`, `/send`, `/recv`). The Yggdrasil mesh handles routing.

---

## On-Chain Contracts

Both deployed on 0G Galileo (chainId 16602):

**`MintPersona` (ERC-7857 fork)**  
`0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B`  
Mints iNFTs. tokenId = derived from cohort+slot index (deterministic). `encryptedURI` = 0G storage root hash of the AES-256-encrypted brain.

**`OffchainResolver`**  
`0xaB32d4b316bE27cE47fCbf92A321f24B22c49121`  
CCIP-read resolver for `cortex.eth`. Reverts `OffchainLookup` pointing at the ENS gateway. Gateway responds with signed EIP-3668 records.

Addresses always read from `infra/deploy/addresses.json` — never hardcoded in source.

---

## Storage Layout on 0G

| What | Where | Format | Encrypted? |
|------|-------|--------|-----------|
| Brain (skills bundle) | 0G Storage `uploadEncrypted()` | JSON bundle of .md files | AES-256 |
| Agent state (profile, pipeline) | 0G KV `kvSet/kvGet` | JSON via Batcher | 0G KV native |
| Episodic log | 0G KV `logAppend` | JSONL entries with head pointer | 0G KV native |
| Persona brain (smith) | 0G Storage `uploadEncrypted()` | JSON persona fields | AES-256 |
| Session reports | 0G Storage `uploadPlain()` | JSON report | No |

Stream IDs derived deterministically: `keccak256("persistent-agent:<agentName>:<kind>")`.

---

## ENS Text Record Schema

Every agent registered in Cortex uses these standard text keys:

| Key | Value | Example |
|-----|-------|---------|
| `agent.framework` | always `persistent-agent-kit` | `persistent-agent-kit` |
| `agent.protocol` | track identifier | `0G`, `AXL`, `ENS`, `apply` |
| `agent.axl_peer` | Yggdrasil public key (hex) | `0x3f2a...` |
| `agent.resume` | 0G brain root hash URI | `0g://0xd848...` |
| `agent.skills` | 0G skill manifest URI | `0g://0xabcd...` |
| `agent.inft` | iNFT reference | `0x1f45...:0` |
| `agent.memory.episodic` | 0G KV stream URI | `0gkv://0x1234...` |

---

## Verification Protocol (before integration testing)

Run in order:

```bash
pnpm -F core smoke:storage     # encrypted upload+download roundtrip
pnpm -F core smoke:compute     # Qwen chat + TeeML processResponse() = true
pnpm -F contracts deploy:testnet  # write addr to infra/deploy/addresses.json
bash infra/axl/spawn.sh 4 && curl :9002/topology  # 3 peers visible
pnpm -F @cortex/smith mint --archetype=...   # tokenId + ensName returned
pnpm -F @cortex/ui dev         # full session demo
```
