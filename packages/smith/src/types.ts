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
