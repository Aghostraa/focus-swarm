---
name: ens-subname-issue
description: Issue an ENS subname via the local CCIP-read gateway and resolve it back via viem. Use when user says "issue ens subname", "set persona ens", "register subdomain".
---

# ens-subname-issue

Self-hosted offchain (CCIP-read EIP-3668) ENS subname issuance. Free per-subname (DB write).

## Prereqs (one-time)
1. Own parent domain (e.g. `cortex.eth`).
2. Deploy `OffchainResolver.sol` (from `gskril/ens-offchain-registrar` or similar).
3. `ENSRegistry.setResolver(namehash('cortex.eth'), offchainResolverAddr)`.
4. Run gateway: `pnpm -F @cortex/ens-gateway dev`.
5. Set env: `ENS_GATEWAY_URL=http://localhost:8787`, `ENS_PARENT_NAME=cortex.eth`.

## Issue subname
```ts
await fetch(`${ENS_GATEWAY_URL}/set`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: `${archetypeSlug}.cohort-${cohortId}.${ENS_PARENT_NAME}`,
    addresses: { 60: ownerEvmAddr },         // ETH coinType
    texts: {
      'agent.inft':       `${inftAddr}:${tokenId}`,
      'agent.axl_peer':   axlPeerIdHex,
      'agent.archetype':  archetypeSlug,
      'agent.resume':     `0g://${rootHash}`,
      'agent.last_session': '',              // updated post-session
    },
  }),
});
```

## Full CCIP-read flow (EIP-3668)

When viem calls `getEnsText`:
1. Contract `OffchainResolver.text(bytes32 node, string key)` is called on-chain
2. Contract reverts with `OffchainLookup(sender, urls, calldata, callbackFunc, extraData)`
3. viem catches the revert, extracts `urls[0]`
4. viem calls `GET {url}?sender={sender}&data={calldata}`
5. Gateway returns signed `{result, signature}`
6. viem calls `OffchainResolver.resolveWithProof(result, extraData)` on-chain to verify signature
7. Returns the text record value

**Gateway signature format:**
```
keccak256(0x1900 || verifier || expires || keccak256(calldata) || keccak256(result))
```
Signed with `ENS_GATEWAY_SIGNER_KEY` (ed25519 key), verified against signer address in `OffchainResolver` constructor.

## Resolve (viem)
```ts
import { createPublicClient, http, normalize } from 'viem';
import { mainnet } from 'viem/chains';

const client = createPublicClient({ chain: mainnet, transport: http() });
const name = normalize(`boomer-dad.cohort-1.cortex.eth`);

// viem auto-handles CCIP-read: revert → fetch → verify → return
const [addr, inftRec, axlRec, resume] = await Promise.all([
  client.getEnsAddress({ name }),
  client.getEnsText({ name, key: 'agent.inft' }),
  client.getEnsText({ name, key: 'agent.axl_peer' }),
  client.getEnsText({ name, key: 'agent.resume' }),
]);

// Example results:
// addr = '0x...' (owner)
// inftRec = '0x1f45C631...:42' (contract:tokenId)
// axlRec = 'ed25519pubkey...'
// resume = '0g://Qm...' (brain rootHash on 0G Storage)
```

**Agent text record schema:**
```typescript
interface AgentEnsRecords {
  'agent.inft'?: string;              // contract:tokenId for ownership
  'agent.axl_peer'?: string;          // ed25519 pubkey for AXL identity
  'agent.archetype'?: string;         // e.g. "analyst", "skeptic", "advocate"
  'agent.resume'?: string;            // 0g://rootHash pointing to latest brain
  'agent.protocol'?: string;          // e.g. "0G", "AXL", "ENS" (framework protocol)
  'agent.memory.episodic'?: string;   // 0gkv://streamId for event log
  'agent.target_market'?: string;     // market filtering for discovery
  'agent.session_count'?: string;     // number for sorting
  'agent.featured'?: string;          // boolean for UI prominence
  'agent.framework'?: string;         // "persistent-agent-kit" or other framework
}
```

Use kit helper:
```ts
import { registerAgentEns, agentEnsTextRecords } from '@cortex/kit';

await registerAgentEns({
  ensName: 'zerog-builder.cortex.eth',
  texts: agentEnsTextRecords({
    protocol: '0G',
    axlPeerId: 'ed25519...',
    brainRootHash: 'Qm...',
    inft: '0x1f45C631...:42',
  }),
});
```

## Update an existing record (e.g. session report)
```ts
await fetch(`${ENS_GATEWAY_URL}/set`, {
  method: 'POST',
  body: JSON.stringify({
    name,
    texts: { 'agent.last_session': `0g://${reportHash}` }
  })
});
```
Gateway should treat `texts` as a partial merge (don't overwrite full record).

## Verify end-to-end
1. POST `/set`.
2. `viem.getEnsText({...})` returns the value.
3. If returns `null`, check: gateway running? parent resolver pointing at offchain contract? wildcard ENSIP-10 enabled in resolver?

## Sources
- https://docs.ens.domains/web/subdomains
- https://docs.ens.domains/resolvers/ccip-read
- `gskril/ens-offchain-registrar`
