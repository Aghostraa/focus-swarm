// Spawn all protocol twins from agents/ configs in parallel.
// Each twin gets its own AXL slot (index from config file order).

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import type { TwinConfig } from './index.js';
import { runTwin } from './runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.resolve(__dirname, '../../kit/examples/protocol-twins/agents');

function loadTwinConfigs(): TwinConfig[] {
  if (!fs.existsSync(agentsDir)) {
    console.warn(`[spawn] agents dir not found: ${agentsDir}`);
    return [];
  }
  return fs.readdirSync(agentsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f, i) => {
      const raw = JSON.parse(fs.readFileSync(path.join(agentsDir, f), 'utf8'));
      const base = Number(process.env.AXL_BASE_PORT ?? 9002);
      const stride = Number(process.env.AXL_PORT_STRIDE ?? 10);
      const mcp_base = 9003;
      const config: TwinConfig = {
        ...raw,
        slotIndex: i,
        axlApiUrl: raw.axlApiUrl ?? `http://127.0.0.1:${base + i * stride}`,
        axlMcpUrl: raw.axlMcpUrl ?? `http://127.0.0.1:${mcp_base + i * stride}`,
      };
      console.log(`[spawn] loaded ${raw.name}: slotIndex=${i}, axlApi=${base + i * stride}, axlMcp=${mcp_base + i * stride}, httpPort=${raw.httpPort ?? 'from-config'}`);
      return config;
    });
}

const configs = loadTwinConfigs();
if (configs.length === 0) {
  console.error('[spawn] no twin configs found');
  process.exit(1);
}

console.log(`[spawn] starting ${configs.length} protocol twins`);
await Promise.allSettled(configs.map((c) => runTwin(c).catch((e) => {
  console.error(`[spawn] twin ${c.name} failed:`, e.message || e);
  throw e;
})));
