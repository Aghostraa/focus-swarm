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

## Resolve (viem)
```ts
import { createPublicClient, http, normalize } from 'viem';
import { mainnet } from 'viem/chains';

const client = createPublicClient({ chain: mainnet, transport: http() });
const name = normalize(`boomer-dad.cohort-1.cortex.eth`);

const [addr, inftRec, axlRec] = await Promise.all([
  client.getEnsAddress({ name }),
  client.getEnsText({ name, key: 'agent.inft' }),
  client.getEnsText({ name, key: 'agent.axl_peer' }),
]);
```
viem auto-handles EIP-3668 OffchainLookup revert → fetch from gateway → return value.

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
