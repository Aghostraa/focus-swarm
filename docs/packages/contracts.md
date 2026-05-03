# @cortex/contracts

On-chain contracts on 0G Galileo (chainId 16602). Two contracts: `MintPersona` (ERC-7857 iNFT) and `OffchainResolver` (CCIP-read ENS).

**Package:** `packages/contracts/`  
**Toolchain:** Hardhat + TypeChain

---

## Deployed addresses

Always read from `infra/deploy/addresses.json`. Never hardcoded.

```json
{
  "MintPersona":       "0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B",
  "OffchainResolver":  "0xaB32d4b316bE27cE47fCbf92A321f24B22c49121",
  "ENSParent":         "cortex.eth"
}
```

---

## MintPersona

**Address:** `0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B`  
**Explorer:** `https://chainscan-galileo.0g.ai/address/0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B`

Mint-only ERC-7857 fork. No transfer-time re-encryption oracle (out of scope for hackathon — client-side AES-256 before upload).

```solidity
function mint(
    address to,
    string calldata encryptedURI_,   // 0G Storage rootHash of AES-256-encrypted brain
    bytes32 metadataHash_            // keccak256(plaintext blob) for integrity
) external returns (uint256 tokenId)
```

Emits `PersonaMinted(tokenId, owner, encryptedURI, metadataHash)`.

```solidity
function encryptedURI(uint256 tokenId) external view returns (string memory)
function metadataHash(uint256 tokenId) external view returns (bytes32)
```

`encryptedURI` returns the 0G Storage root hash (`0xd848...`). Combine with decryption key (held off-chain) to reconstruct the persona brain.

### Minting via `@cortex/smith`

```bash
pnpm -F @cortex/smith mint --archetype=genz-renter-berlin --market="GenZ renters" --cohort=1
```

Or programmatically:

```typescript
import { generatePersona, mintPersona } from '@cortex/smith';

const spec = await generatePersona('GenZ renters', 'genz-renter-berlin', 1);
const result = await mintPersona(spec);
// result.tokenId, result.txHash, result.rootHash
```

---

## OffchainResolver

**Address:** `0xaB32d4b316bE27cE47fCbf92A321f24B22c49121`

CCIP-read resolver for `cortex.eth`. Implements EIP-3668:

1. On-chain `resolve(bytes name, bytes calldata)` reverts with `OffchainLookup(gateway, calldata)`
2. Client calls `GET <gateway>/ccip/<sender>/<calldata>`
3. Gateway returns ABI-encoded `(result, expires, sig)`
4. Client calls `resolve(name, result, sig)` on-chain
5. Contract verifies ECDSA signature against `ENS_GATEWAY_SIGNER_KEY`

### Signature verification

```
msgHash = keccak256(
  0x1900
  + verifierAddress      // OffchainResolver address
  + expires (8 bytes)    // Unix timestamp
  + keccak256(calldata)
  + keccak256(result)
)
```

`ENS_GATEWAY_SIGNER_KEY` must match the key registered in the contract. For local dev, can be same as `PRIVATE_KEY`.

---

## Hardhat scripts

```bash
# Deploy both contracts to 0G testnet Galileo
pnpm -F @cortex/contracts deploy:testnet

# Verify on chain scanner (optional)
pnpm -F @cortex/contracts verify
```

Deploy writes addresses to `infra/deploy/addresses.json`.

**Network config** (`hardhat.config.ts`):
```typescript
galileo: {
  url: 'https://evmrpc-testnet.0g.ai',
  chainId: 16602,
  accounts: [process.env.PRIVATE_KEY],
}
```

---

## ABI

`packages/contracts/abi.json` — flat ABI array for `MintPersona`. Used by `@cortex/smith` via `ethers.Contract`.

TypeChain types generated at `packages/contracts/typechain-types/`.

---

## Hard constraints

- **Testnet Galileo only.** Never deploy to mainnet 0G or Ethereum.
- **Read addresses from `infra/deploy/addresses.json`.** Never hardcode.
- `MintPersona` is mint-only — no transfer oracle. Persona ownership = original minter.
