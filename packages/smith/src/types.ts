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
