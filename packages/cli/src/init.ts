// cortex init — bootstrap AXL cohort and protocol-twins agents

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const logDir = path.resolve(process.cwd(), 'infra/axl/logs');

export async function status() {
  const pidFile = path.join(logDir, 'cortex-twins.pid');
  if (!fs.existsSync(pidFile)) {
    console.log('No cortex process running. Run: cortex init');
    return;
  }

  const pid = fs.readFileSync(pidFile, 'utf-8').trim();
  console.log(`Cortex twins running (PID: ${pid})`);

  // Quick online check
  for (const port of [9013, 9023, 9033]) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/capabilities`, {
        signal: AbortSignal.timeout(1000),
      });
      console.log(`  :${port} — ${r.ok ? 'online' : 'offline'}`);
    } catch {
      console.log(`  :${port} — offline`);
    }
  }
}

export async function init() {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  console.log('[1/3] Checking prerequisites...');
  // Node version check (basic)
  const nodeVersion = process.versions.node;
  console.log(`  Node ${nodeVersion}`);

  console.log('\n[2/3] Starting AXL cohort...');
  const axlProc = spawn('bash', ['infra/axl/spawn.sh', '3'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  });

  // Poll :9002/topology
  const waitAxl = async () => {
    const maxRetries = 30;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const r = await fetch('http://127.0.0.1:9002/topology', {
          signal: AbortSignal.timeout(2000),
        });
        if (r.ok) {
          const topo = (await r.json()) as { peers: any[] };
          if (topo.peers.length >= 2) {
            console.log(`  AXL ready (${topo.peers.length} peers visible)`);
            return true;
          }
        }
      } catch {
        // retry
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('AXL cohort failed to start (timeout)');
  };

  await waitAxl();

  console.log('\n[3/3] Starting protocol-twins agents...');
  const twinsProc = spawn('pnpm', ['-F', '@cortex/protocol-twins', 'start'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
  });

  // Poll all 3 HTTP ports
  const waitTwins = async () => {
    const ports = [9013, 9023, 9033];
    const maxRetries = 40;
    for (let i = 0; i < maxRetries; i++) {
      let allOnline = true;
      for (const port of ports) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/capabilities`, {
            signal: AbortSignal.timeout(1000),
          });
          if (!r.ok) allOnline = false;
        } catch {
          allOnline = false;
        }
      }
      if (allOnline) {
        console.log('  All 3 agents ready (9013, 9023, 9033)');
        return true;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('Protocol-twins failed to start (timeout)');
  };

  await waitTwins();

  // Save PID for status command
  fs.writeFileSync(path.join(logDir, 'cortex-twins.pid'), String(twinsProc.pid));

  console.log('\n✓ Cortex environment ready!');
  console.log('');
  console.log('Next: cortex discover');
}
