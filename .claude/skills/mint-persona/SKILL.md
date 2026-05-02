---
name: mint-persona
description: End-to-end mint a persona iNFT. Generate persona via 0G Compute → encrypt brain → upload to 0G Storage → mint ERC-7857 → register ENS subname. Use when user says "mint persona", "create persona iNFT", "spawn an archetype".
---

# mint-persona

Single command path from archetype spec to live persona NFT + ENS subname.

## Inputs (PersonaSpec)
- `archetype` — slug like `"boomer-dad-houston"`, `"genz-renter-berlin"`
- `targetMarket` — string brief shaping persona priors
- `cohortId` — number, used in ENS subname `<archetype>.cohort-<N>.cortex.eth`

## Output
```ts
{
  tokenId: number,
  rootHash: string,        // 0G Storage root for encrypted persona blob
  encryptionKey: Uint8Array, // 32 bytes AES-256, store securely
  axlPeerId: string,       // ed25519 pubkey hex
  ensName: string,
  txHash: string
}
```

## Steps
1. **Generate persona JSON** via 0G Compute (Qwen 2.5 7B) — system prompt: archetype generator. Output: life story, values, traumas, media diet, tech literacy, communication style. Verify with `broker.inference.processResponse()`.
2. **Generate AXL identity**: `openssl genpkey -algorithm ed25519 -out infra/axl/keys/persona-<tokenId>.pem`. Extract pubkey hex → axlPeerId.
3. **Encrypt + upload** persona JSON to 0G Storage:
   ```ts
   const key = crypto.randomBytes(32);
   const file = ZgFile.fromBuffer(Buffer.from(JSON.stringify(spec)));
   const [tx, err] = await indexer.upload(file, RPC_URL, signer, {
     encryption: { type: 'aes256', key }
   });
   const rootHash = tx.rootHash;
   ```
4. **Mint iNFT**: call `MintPersona.mint(owner, encryptedURI=rootHash, metadataHash=keccak256(specBytes))`. Capture tokenId from event.
5. **Register ENS subname**: POST to local gateway:
   ```
   POST http://localhost:8787/set
   { "name": "<archetype>.cohort-<N>.cortex.eth",
     "addresses": { "60": <ownerAddr> },
     "texts": {
       "agent.inft": "<inftAddr>:<tokenId>",
       "agent.axl_peer": "<axlPeerId>",
       "agent.archetype": "<archetype>",
       "agent.resume": "0g://<rootHash>"
     } }
   ```
6. **Sealed key handoff** — write encryption key to `infra/axl/keys/persona-<tokenId>.aes` (gitignored). For full ERC-7857 transfer flow this would be sealed via TEE oracle; out of scope for hackathon mint-only path.
7. **Verify**:
   - `curl https://chainscan-galileo.0g.ai/tx/<txHash>`
   - `viem.getEnsText({ name: ensName, key: 'agent.inft' })` returns `<inftAddr>:<tokenId>`
   - `indexer.peekHeader(rootHash)` returns AES-256 mode

## File refs
- `../0g-doc/docs/developer-hub/building-on-0g/storage/sdk.md:286-420` — upload + encrypt
- `../0g-doc/docs/developer-hub/building-on-0g/compute-network/inference.md:466-940` — broker
- `../0g-doc/docs/developer-hub/building-on-0g/inft/integration.md:127-139` — mint
- iNFT ref impl: `https://github.com/0gfoundation/0g-agent-nft` branch `eip-7857-draft`

## Don't
- Skip TeeML verification on persona generation — invariant in CLAUDE.md.
- Upload plaintext persona JSON.
- Use mainnet.
