# @cortex/smith

Persona generation pipeline. Given a target market + archetype slug, produces a synthetic focus-group panelist: generates backstory via 0G Compute, encrypts brain, uploads to 0G Storage, mints as an ERC-7857 iNFT, and registers ENS subname.

**Package:** `packages/smith/`

---

## CLI

```bash
pnpm -F @cortex/smith mint --archetype=genz-renter-berlin --market="GenZ renters" --cohort=1
```

Output:
```json
{
  "tokenId": 7,
  "rootHash": "0xd848...",
  "axlPeerId": "0x3f2a...",
  "ensName": "genz-renter-berlin.cohort-1.cortex.eth",
  "txHash": "0xabcd...",
  "storageTxHash": "0xefgh..."
}
```

Encryption key saved to `infra/axl/keys/persona-<tokenId>.aes`.

---

## API

### `generatePersona(targetMarket, archetype, cohortId): Promise<PersonaSpec>`

1. Fetches ground truth from Wikidata (Big 5 personality anchors, behavioral facts)
2. Builds system prompt grounding the LLM in those facts
3. Calls `chat()` (0G Compute) — throws if not TeeML-verified
4. Parses JSON output into `PersonaSpec`
5. Infers `role` from archetype slug and tech literacy

```typescript
import { generatePersona } from '@cortex/smith';

const spec = await generatePersona('GenZ renters Berlin', 'genz-renter-berlin', 1);
// spec.lifeStory, spec.values, spec.traumas, spec.mediaDiet, spec.techLiteracy,
// spec.communicationStyle, spec.dialogueSamples, spec.role, spec.skills
```

Ground truth fetched from Wikidata. Falls back to neutral defaults if unavailable.

### `mintPersona(spec): Promise<MintedPersona>`

1. Generates AES-256 key (`crypto.randomBytes(32)`)
2. Encrypts serialized `PersonaSpec` → uploads to 0G Storage
3. Generates ed25519 keypair for AXL node → saves PEM to `infra/axl/keys/persona-<slug>.pem`
4. Calls `MintPersona.mint(owner, rootHash, metadataHash)` on 0G Galileo
5. Parses `PersonaMinted(tokenId, owner, encryptedURI, metadataHash)` event
6. Registers ENS: `<archetype>.cohort-<n>.cortex.eth`
7. Saves key to `infra/axl/keys/persona-<tokenId>.aes`

```typescript
import { mintPersona } from '@cortex/smith';

const result = await mintPersona(spec);
// result.tokenId, result.rootHash, result.ensName, result.txHash
```

### `evolvePersona(params): Promise<EvolveResult | null>`

After a session, update persona skills based on utterances + session themes. TeeML-verified. Re-uploads encrypted brain to 0G, updates ENS `agent.resume`, writes to 0G KV fast-path.

```typescript
import { evolvePersona } from '@cortex/smith';

const result = await evolvePersona({
  tokenId: 7,
  ensName: 'genz-renter-berlin.cohort-1.cortex.eth',
  currentSpec: spec,
  currentKey: keyBuffer,
  myUtterances: ['I'd never pay that much...', 'The UI is overwhelming'],
  reportThemes: ['price sensitivity', 'onboarding friction'],
  reportOpportunities: ['freemium tier', 'simplified onboarding'],
  productBrief: 'Fintech app targeting urban renters',
});
// result.newRootHash, result.updatedSkills
```

Skill deltas are conservative: max 0.05–0.08 per session.

### `awakenPersonas(market, brief, limit?): Promise<AwakenResult[]>`

Find existing catalog personas matching a target market, load their brains from 0G, generate a brief "expression of interest" for the research topic.

```typescript
import { awakenPersonas } from '@cortex/smith';

const candidates = await awakenPersonas('GenZ renters', 'Fintech app for urban renters', 6);
// Each: { ensName, tokenId, archetype, applicationText, verified, rootHash, spec }
```

Calls `GET /personas?market=...` on ENS gateway, then loads and speaks each matching persona.

---

## PersonaSpec

```typescript
interface PersonaSpec {
  archetype: string;
  targetMarket: string;
  cohortId: number;
  lifeStory: string;
  values: string[];
  traumas: string[];
  mediaDiet: string[];
  techLiteracy: 'low' | 'medium' | 'high';
  communicationStyle: string;
  wdFacts?: string[];         // Wikidata behavioral facts used as ground truth
  dialogueSamples?: string[]; // 4 sample utterances in this person's voice
  role?: PersonaRole;
  skills?: PersonaSkills;
}

type PersonaRole = 'consumer' | 'pm' | 'technical-skeptic' | 'user-advocate' | 'accessibility-lens';
```

`role` inferred from archetype slug: regex matching against `engineer`, `founder`, `ux`, `boomer`, etc.

---

## PersonaSkills (evolving over sessions)

```typescript
interface PersonaSkills {
  sessionCount: number;
  role: PersonaRole;
  domainKnowledge: Record<string, number>;  // domain → 0–1 score
  uxLiteracy: number;       // 0–1
  technicalDepth: number;   // 0–1
  communicationMaturity: number; // 0–1
  sessionSummaries: string[];    // rolling last 5 session summaries
}
```

Initial values derived from Big 5 personality anchors and tech literacy.

---

## ENS naming convention

`<archetype-slug>.cohort-<n>.cortex.eth`

Examples:
- `genz-renter-berlin.cohort-1.cortex.eth`
- `senior-homeowner-texas.cohort-1.cortex.eth`

Parent: `cortex.eth` (or `ENSParent` from `addresses.json`).

---

## Key files

| Path | Purpose |
|------|---------|
| `infra/axl/keys/persona-<slug>.pem` | ed25519 private key for AXL node |
| `infra/axl/keys/persona-<tokenId>.aes` | AES-256 brain encryption key |
| `infra/deploy/addresses.json` | Contract addresses (read at runtime) |

Never commit `infra/axl/keys/*.pem` or `*.aes` files.

---

## Dependencies

- `@cortex/core` — `chat`, `uploadEncrypted`, `downloadDecrypted`, `getWallet`, `kvSet`, `streamIdFromLabel`, `loadEd25519PubkeyHex`
- `ethers` — contract interaction
- `better-sqlite3` — not used by smith directly (gateway owns that)
