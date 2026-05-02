export interface TwinConfig {
  name: string;
  ensName?: string;
  protocol?: string;
  mission: string;
  boundaries?: string[];
  skills?: string[];
  axlApiUrl?: string;
  axlMcpUrl?: string;
  slotIndex?: number; // for HTTP port: 9013 + slotIndex*10
}

export { runTwin } from './runtime.js';
