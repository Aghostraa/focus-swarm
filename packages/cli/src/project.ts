// cortex project — orchestrate full multi-agent dev session

import * as fs from 'node:fs';
import * as path from 'node:path';
import { runDevSession } from '@cortex/protocol-twins';
import { resolveAgentEns } from '@cortex/kit';
import { renderCapabilities, renderPeerExchanges } from './render.js';
import { generateMarkdown } from './markdown.js';

const AGENT_ENS_NAMES = [
  'zerog-builder.cortex.eth',
  'axl-builder.cortex.eth',
  'ens-builder.cortex.eth',
];

function slugify(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function project(description: string) {
  if (!description.trim()) {
    console.error('Usage: cortex project "<project description>"');
    process.exit(1);
  }

  console.log('Cortex Development Orchestration');
  console.log(`Project: ${description}\n`);

  // Preflight: check agents online
  console.log('Preflight: checking agents...');
  const agents: { name: string; httpPort: number; axlApiUrl: string; ensName: string }[] =
    [];

  for (const ensName of AGENT_ENS_NAMES) {
    const shortName = ensName.split('.')[0];
    const httpPort =
      shortName === 'zerog-builder' ? 9013 : shortName === 'axl-builder' ? 9023 : 9033;
    const axlApiUrl =
      shortName === 'zerog-builder'
        ? 'http://127.0.0.1:9022'
        : shortName === 'axl-builder'
          ? 'http://127.0.0.1:9002'
          : 'http://127.0.0.1:9012';

    try {
      const r = await fetch(`http://127.0.0.1:${httpPort}/capabilities`, {
        signal: AbortSignal.timeout(2000),
      });
      if (r.ok) {
        agents.push({ name: shortName, httpPort, axlApiUrl, ensName });
        console.log(`  ✓ ${shortName}`);
      } else {
        console.log(`  ✗ ${shortName} (status ${r.status})`);
      }
    } catch (e) {
      console.log(`  ✗ ${shortName} (offline)`);
    }
  }

  if (agents.length === 0) {
    console.error('No agents online. Run: cortex init');
    process.exit(1);
  }

  console.log(`\n${agents.length}/3 agents ready\n`);

  // Orchestrate
  console.log('Orchestrating multi-agent session...\n');

  const session = await runDevSession(description, agents, { timeoutMs: 20_000 });

  console.log(`\nSession ${session.projectId} complete`);
  console.log(`  ${session.capabilities.length} capabilities`);
  console.log(`  ${session.peerExchanges.length} peer exchanges`);
  console.log(`  ${session.implementationOrder.length} agents in order\n`);

  renderCapabilities(session.capabilities);
  renderPeerExchanges(session.peerExchanges);

  // Generate markdown and write to project dir
  const slug = slugify(description);
  const projDir = path.resolve(process.cwd(), slug);
  fs.mkdirSync(projDir, { recursive: true });

  const markdown = generateMarkdown(session);
  const mdFile = path.join(projDir, 'CORTEX_DEV_SESSION.md');
  fs.writeFileSync(mdFile, markdown, 'utf-8');

  console.log(`\nSession written to: ${mdFile}`);
  console.log('');
  console.log('Claude Code can now implement this project:');
  console.log(`  cd ${slug}`);
  console.log('  cat CORTEX_DEV_SESSION.md  # Review the architecture');
  console.log('');
  console.log('Agents remain available for live queries during development:');
  console.log('  curl http://localhost:9013/ask -X POST -d \'{"message":"Implement..."}\'');
}
