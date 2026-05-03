#!/usr/bin/env node

import 'dotenv/config';

const [, , command, ...args] = process.argv;

(async () => {
  try {
    if (command === 'init') {
      const { init } = await import('./init.js');
      await init();
    } else if (command === 'discover') {
      const { discover } = await import('./discover.js');
      await discover();
    } else if (command === 'project') {
      const { project } = await import('./project.js');
      await project(args[0] || '');
    } else if (command === 'status') {
      const { status } = await import('./init.js');
      await status();
    } else {
      console.log('Cortex DevBuddy — Multi-Agent Development Orchestration');
      console.log('');
      console.log('Commands:');
      console.log('  cortex init                    Bootstrap AXL + agents');
      console.log('  cortex discover                List available agents via ENS');
      console.log('  cortex project "<description>" Orchestrate multi-agent dev session');
      console.log('  cortex status                  Show running process status');
    }
  } catch (e) {
    console.error('[cortex]', (e as Error).message);
    process.exit(1);
  }
})();
