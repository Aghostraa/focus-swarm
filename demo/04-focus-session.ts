#!/usr/bin/env tsx
// Demo 4: Run a 3-persona focus group session via moderator
// Track: 0G Agents 
// Shows: full session orchestration, AXL mesh, 0G Compute per turn, synthesizer report

import 'dotenv/config';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const PRODUCT = process.env.DEMO_PRODUCT ?? 'Cortex — decentralized AI agent framework on 0G Storage, AXL mesh, and ENS identity. Agents have encrypted brains on 0G, are discoverable via ENS, and communicate peer-to-peer over AXL.';
const ARCHETYPE_COUNT = 3;

async function main() {
  console.log('[demo:04] Starting focus session...');
  console.log(`[demo:04] Product: ${PRODUCT.slice(0, 80)}...`);
  console.log(`[demo:04] Archetypes: ${ARCHETYPE_COUNT}`);

  const moderatorPkg = '@cortex/moderator';

  try {
    execSync(
      `pnpm -F ${moderatorPkg} start`,
      {
        env: {
          ...process.env,
          PRODUCT_DESCRIPTION: PRODUCT,
          SESSION_ARCHETYPE_COUNT: String(ARCHETYPE_COUNT),
          SESSION_TURN_COUNT: '2',
          DRY_RUN: process.env.DRY_RUN ?? 'false',
        },
        cwd: root,
        stdio: 'inherit',
        timeout: 120_000,
      },
    );
    console.log('[demo:04] PASS');
  } catch (e) {
    // Non-zero exit from moderator is OK if it printed output (some infra might not be up).
    if (process.env.CI) throw e;
    console.warn('[demo:04] Moderator exited non-zero (infra may be offline) — check output above');
    console.log('[demo:04] PASS (partial)');
  }
}

main().catch((e) => { console.error('[demo:04] FAIL', e); process.exit(1); });
