export type PersonaRole =
  | 'consumer'           // general product user — everyday experience lens
  | 'technical-skeptic'  // challenges implementation claims, spots complexity
  | 'user-advocate'      // UX focus, onboarding friction, accessibility
  | 'pm'                 // prioritises by ROI, frames issues as tickets
  | 'accessibility-lens'; // low tech literacy perspective

export interface PersonaSkills {
  sessionCount: number;
  role: PersonaRole;
  domainKnowledge: Record<string, number>;  // e.g. { fintech: 0.7, saas: 0.4 }
  uxLiteracy: number;            // 0–1
  technicalDepth: number;        // 0–1
  communicationMaturity: number; // 0–1
  sessionSummaries: string[];    // last 5 compact summaries (≤100 words each)
}

export interface PersonaSpec {
  archetype: string;
  targetMarket: string;
  cohortId: number;
  lifeStory: string;
  values: string[];
  traumas: string[];
  mediaDiet: string[];
  techLiteracy: 'low' | 'medium' | 'high';
  communicationStyle: string;
  // Ground truth enrichment
  wdFacts?: string[];        // Watch Dogs Legion behavioral facts used as seeds
  dialogueSamples?: string[]; // 3-5 example utterances in persona voice (NPC-format anchoring)
  // Accumulated experience
  role?: PersonaRole;
  skills?: PersonaSkills;
}

export interface MintedPersona {
  tokenId: number;
  rootHash: string;
  encryptionKeyHex: string;
  axlPeerId: string;
  ensName: string;
  txHash: string;
  storageTxHash: string;
}
