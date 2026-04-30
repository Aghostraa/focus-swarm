export interface SkillExample {
  input: string;
  output: string;
}

export interface SkillEval {
  name: string;
  prompt: string;
  expected: string;
}

export interface AgentToolSpec {
  name: string;
  description: string;
  transport?: 'mcp' | 'local' | 'axl';
}

export interface SkillPack {
  name: string;
  version: string;
  description: string;
  triggers: string[];
  instructions: string;
  sourcePath?: string;
  tools?: AgentToolSpec[];
  examples?: SkillExample[];
  evals?: SkillEval[];
}

export interface InstalledSkill {
  name: string;
  version: string;
  description: string;
  triggers: string[];
  rootHash?: string;
  sourcePath?: string;
  installedAt: number;
  enabled: boolean;
}

export interface SkillManifest {
  agentName: string;
  skills: InstalledSkill[];
  generatedAt: number;
}
