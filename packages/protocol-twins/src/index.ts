export interface TwinConfig {
  name: string;
  ensName?: string;
  protocol?: string;
  mission: string;
  boundaries?: string[];
  skills?: string[];
  axlApiUrl?: string;
  axlMcpUrl?: string;
}

export { runTwin } from './runtime.js';
