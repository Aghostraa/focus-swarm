// cortex discover — resolve agents via ENS, show available skills and capabilities

import { resolveAgentEns } from '@cortex/kit';

const AGENT_ENS_NAMES = [
  'zerog-builder.cortex.eth',
  'axl-builder.cortex.eth',
  'ens-builder.cortex.eth',
];

export async function discover() {
  console.log('Cortex Agent Discovery\n');
  console.log('Resolving ENS names...\n');

  const agents: {
    name: string;
    protocol: string;
    axlPeer: string;
    brainHash: string;
    online: boolean;
  }[] = [];

  for (const ensName of AGENT_ENS_NAMES) {
    try {
      const record = await resolveAgentEns(ensName);
      const shortName = ensName.split('.')[0];
      const protocol = record.texts?.['agent.protocol'] || 'unknown';
      const axlPeer = record.texts?.['agent.axl_peer'] || '?';
      const resume = record.texts?.['agent.resume'] || '?';

      // Check online
      let online = false;
      try {
        const httpPort =
          shortName === 'zerog-builder'
            ? 9013
            : shortName === 'axl-builder'
              ? 9023
              : 9033;
        const r = await fetch(`http://127.0.0.1:${httpPort}/capabilities`, {
          signal: AbortSignal.timeout(2000),
        });
        online = r.ok;
      } catch {
        online = false;
      }

      agents.push({
        name: shortName,
        protocol,
        axlPeer: axlPeer.slice(0, 12) + (axlPeer.length > 12 ? '...' : ''),
        brainHash: resume.slice(0, 12) + (resume.length > 12 ? '...' : ''),
        online,
      });
    } catch (e) {
      console.warn(`✗ ${ensName}: ${(e as Error).message}`);
    }
  }

  if (!agents.length) {
    console.log('No agents found. Run: cortex init');
    return;
  }

  console.log('Available Agents:');
  console.log('');
  console.log(
    agents
      .map(
        (a) =>
          `${a.online ? '✓' : '✗'} ${a.name.padEnd(15)} | ${a.protocol.padEnd(6)} | peer: ${a.axlPeer.padEnd(15)} | brain: ${a.brainHash}`,
      )
      .join('\n'),
  );
  console.log('');
  console.log('Next: cortex project "Build a decentralized voting app"');
}
