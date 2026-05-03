# Demo 05: Cortex DevBuddy — Multi-Agent Development Session

Full end-to-end production demo showing agents self-organizing to architect a decentralized voting system.

**What you'll see:**
- 3 agents (0G Storage, AXL P2P, ENS Identity experts) discover each other via ENS
- Agents negotiate capabilities via AXL peer-to-peer protocol
- System generates implementation dependency graph
- Agent roles and integration order printed

## Prerequisites

```bash
# Install dependencies
pnpm install

# Verify testnet access
pnpm -F core smoke:storage
pnpm -F core smoke:compute

# Deploy contracts
pnpm -F contracts deploy:testnet

# Check addresses.json exists
cat infra/deploy/addresses.json
```

## Full Demo Steps

### 1. Start ENS Gateway (Terminal 1)

```bash
cd packages/ens-gateway
pnpm dev
```

Expected output:
```
[ens-gateway] :8787, db=/path/to/focus-swarm/infra/deploy/ens.db
```

### 2. Spawn AXL Cohort (Terminal 2)

```bash
bash infra/axl/spawn.sh 3
```

Expected output:
```
[axl:0] listening on :9002 (api), :9003 (mcp), :9004 (a2a)
[axl:1] listening on :9012 (api), :9013 (mcp), :9014 (a2a)
[axl:2] listening on :9022 (api), :9023 (mcp), :9024 (a2a)
```

Verify mesh connectivity:
```bash
curl http://127.0.0.1:9002/topology | jq '.peers | length'
# Should see 2 peers per node
```

### 3. Mint Agent Personas (Terminal 3)

Register each agent archetype as an iNFT with ENS subname:

```bash
# Agent 1: 0G Storage Expert
pnpm -F smith mint --archetype=zerog-builder

# Agent 2: AXL P2P Expert
pnpm -F smith mint --archetype=axl-builder

# Agent 3: ENS Identity Expert
pnpm -F smith mint --archetype=ens-builder
```

Expected output per agent:
```
[mint] zerog-builder → tokenId=1001, ensName=zerog-builder.cohort-0.cortex.eth
[mint] registered on ENS + 0G Storage
```

### 4. Start Agent Runtime Processes (Terminal 4–6)

Each agent boots with its persona, connects to AXL, registers ENS text records:

**Agent 1 (0G Storage):**
```bash
HTTP_PORT=9013 AXL_API_URL=http://127.0.0.1:9022 \
pnpm -F persona start zerog-builder.cohort-0.cortex.eth
```

**Agent 2 (AXL P2P):**
```bash
HTTP_PORT=9023 AXL_API_URL=http://127.0.0.1:9002 \
pnpm -F persona start axl-builder.cohort-0.cortex.eth
```

**Agent 3 (ENS Identity):**
```bash
HTTP_PORT=9033 AXL_API_URL=http://127.0.0.1:9012 \
pnpm -F persona start ens-builder.cohort-0.cortex.eth
```

Expected output per agent:
```
[twin:zerog-builder] ready — listening on AXL + HTTP
[twin:zerog-builder] HTTP /ask server on :9013
```

Verify agent discovery:
```bash
curl http://127.0.0.1:8787/personas | jq '.[] | .name'
# Should see: zerog-builder, axl-builder, ens-builder
```

### 5. Run Dev Session (Terminal 7)

```bash
pnpm demo:dev-session
```

**Step-by-step execution:**

1. **Agent Discovery** — Queries ENS gateway for all registered personas
   ```
   [demo:05] Discovering agents from http://127.0.0.1:8787...
   [demo:05] Discovered 3 persona(s)
   ```

2. **Session Init** — Agents receive project brief, declare capabilities
   ```
   POST /project to each agent (zerog-builder, axl-builder, ens-builder)
   Each agent introspects role using verified inference (0G Compute)
   ```

3. **Peer Negotiation** — Agents query each other via AXL A2A protocol
   ```
   [twin:zerog-builder] peer_query from=axl-builder
   [twin:axl-builder] peer_answer → zerog-builder
   ```

4. **Dependency Analysis** — System builds implementation graph
   ```
   [demo:05] Building dependency graph...
   [demo:05] Computing topological sort...
   ```

5. **Results** — Print final session report
   ```
   [demo:05] Agent Roles:
     zerog-builder: 0G Storage + Encryption Expert
     axl-builder: AXL P2P Mesh Coordinator
     ens-builder: ENS Identity & Discovery Layer

   [demo:05] Implementation Order:
     1. zerog-builder (encrypted ballot storage)
     2. axl-builder (validator mesh sync)
     3. ens-builder (voter identity resolution)

   [demo:05] Peer Exchanges (AXL):
     zerog-builder → axl-builder: "how should P2P sync interact with 0G storage?"
     axl-builder → zerog-builder: verified=true, skill=protocol-design
   ```

## Expected Success Criteria

✅ Gateway lists 3 personas  
✅ Demo discovers all agents via ENS  
✅ Agents communicate via AXL (≥3 peer exchanges)  
✅ Capabilities match agent archetypes  
✅ Implementation order forms valid DAG (no cycles)  
✅ All inferences verified via 0G Compute  

## Troubleshooting

### "Gateway lookup failed"
→ Ensure ENS gateway running: `pnpm -F ens-gateway dev`

### "AXL peer not found"
→ Verify cohort spawned: `curl http://127.0.0.1:9002/topology`

### "No peer exchanges recorded"
→ Check agent ENS registration: `curl http://127.0.0.1:8787/lookup/zerog-builder.cohort-0.cortex.eth`

### "Dependency graph invalid"
→ Verify all 3 peer_query → peer_answer roundtrips complete (20s timeout)

## Observability

### Agent Activity Logs
```bash
tail -f /tmp/cortex-agent-zerog-builder.log
```

### ENS Registry State
```bash
sqlite3 infra/deploy/ens.db "SELECT name, texts FROM records;"
```

### AXL Mesh Topology
```bash
curl http://127.0.0.1:9002/topology | jq .peers
```

### Session State
```bash
curl http://127.0.0.1:9013/session/{projectId}
```

## Next Steps

- **Scale to N agents:** Modify spawn.sh to 5+ nodes, mint additional archetypes
- **Custom personas:** Edit `packages/smith/archetypes/*.ts` to add domain-specific experts
- **Persist sessions:** Load prior session memories from 0G KV before re-running
- **Integrate with product:** Use `/project` endpoint from your app to test with real users
