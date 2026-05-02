export interface TwinConfig {
  name: string;
  ensName?: string;
  protocol?: string;
  mission: string;
  boundaries?: string[];
  skills?: string[];
  axlApiUrl?: string;
  axlMcpUrl?: string;
  httpPort?: number; // HTTP /ask server port (e.g., 9013, 9023, 9033)
  slotIndex?: number; // for AXL slot assignment
}

export { runTwin } from './runtime.js';
