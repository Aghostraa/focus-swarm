// Harness — pushes product observations into the AXL bus so personas can
// react to actual product content rather than just the brief.

import 'dotenv/config';
import fs from 'node:fs';
import { AxlClient, type SwarmMsg } from '@cortex/core';

const AXL_API = process.env.AXL_API_URL ?? 'http://127.0.0.1:9002';
const PEER_LIST_PATH = process.env.PEER_LIST_PATH ?? './infra/axl/peers.local.json';
const SESSION_ID = process.env.SESSION_ID ?? `s-${Date.now()}`;
const SOURCE = process.env.HARNESS_SOURCE ?? 'product-page';
const CONTENT_PATH = process.env.HARNESS_CONTENT;
const CONTENT_TEXT = process.env.HARNESS_TEXT;

async function main() {
  if (!CONTENT_PATH && !CONTENT_TEXT) throw new Error('HARNESS_CONTENT or HARNESS_TEXT required');
  const text = CONTENT_TEXT ?? fs.readFileSync(CONTENT_PATH!, 'utf8');

  const axl = new AxlClient(AXL_API);
  const peers: { peerId: string }[] = JSON.parse(fs.readFileSync(PEER_LIST_PATH, 'utf8'));
  const myPub = await axl.myPubkey();
  const targets = peers.filter((p) => p.peerId !== myPub);
  const msg: SwarmMsg = {
    type: 'observation',
    sessionId: SESSION_ID,
    source: SOURCE,
    content: text.slice(0, 4000),
    ts: Date.now(),
  };
  await Promise.all(targets.map((p) => axl.send(p.peerId, msg).catch(() => {})));
  console.log(`[harness] pushed observation to ${targets.length} peers`);
}

main().catch((e) => {
  console.error('[harness] fatal', e);
  process.exit(1);
});
