// Terminal rendering for agent discovery and orchestration output

import type { CapabilityRecord, PeerExchange } from '@cortex/protocol-twins';

const isTTY = process.stdout.isTTY;

function color(text: string, code: string): string {
  return isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export function renderCapabilities(caps: CapabilityRecord[]) {
  console.log(color('Agent Capabilities:', '1;32'));
  console.log('');

  for (const cap of caps) {
    console.log(`${color(cap.agent, '33')} — ${cap.role}`);
    if (cap.provides.length)
      console.log(`  Provides: ${cap.provides.map((p) => color(p, '36')).join(', ')}`);
    if (cap.needs.length) console.log(`  Needs: ${cap.needs.join(', ')}`);
    console.log('');
  }
}

export function renderPeerExchanges(exchanges: PeerExchange[]) {
  if (!exchanges.length) return;

  console.log(color('AXL Peer Negotiations:', '1;32'));
  console.log('');

  for (const ex of exchanges) {
    console.log(`${color(ex.from, '33')} → ${color(ex.to, '33')}`);
    console.log(`  Q: ${ex.question.slice(0, 80)}...`);
    console.log(
      `  A: ${ex.answer.slice(0, 100)}... ${color(`[verified=${ex.verified}]`, ex.verified ? '32' : '31')}`,
    );
    console.log('');
  }
}
