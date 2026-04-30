export type IntegrationOutcome = 'worked' | 'failed' | 'partial' | 'unknown';

export interface IntegrationEvent {
  id: string;
  task: string;
  protocol?: string;
  error?: string;
  fix?: string;
  command?: string;
  filesTouched?: string[];
  outcome: IntegrationOutcome;
  timestamp: number;
}

export interface KnowledgeNote {
  id: string;
  text: string;
  source?: string;
  confidence: number;
  updatedAt: number;
}

export interface FixPattern {
  id: string;
  problem: string;
  fix: string;
  protocol?: string;
  evidence: string[];
  successCount: number;
  failureCount: number;
  updatedAt: number;
}
