// Encrypted upload + decrypt roundtrip + KV r/w against testnet Galileo.
// Requires PRIVATE_KEY funded via https://faucet.0g.ai
import crypto from 'node:crypto';
import {
  uploadEncrypted,
  downloadDecrypted,
  kvSet,
  kvGet,
  logAppend,
  logRead,
  streamIdFromLabel,
} from '../src/storage.js';

async function main() {
  const key = crypto.randomBytes(32);
  const payload = Buffer.from(JSON.stringify({ hello: 'focus-swarm', t: Date.now() }));

  console.log('[smoke] encrypt+upload, bytes:', payload.length);
  const up = await uploadEncrypted(payload, key);
  console.log('[smoke] rootHash', up.rootHash, 'tx', up.txHash);

  console.log('[smoke] download+decrypt');
  const got = await downloadDecrypted(up.rootHash, key);
  if (got.toString() !== payload.toString()) throw new Error('plaintext mismatch');
  console.log('[smoke] storage roundtrip OK');

  const stream = streamIdFromLabel(`smoke:${Date.now()}`);
  console.log('[smoke] kv set, streamId', stream);
  await kvSet(stream, 'mood', { v: 0.7, label: 'curious' });
  const v = await kvGet<{ v: number; label: string }>(stream, 'mood');
  console.log('[smoke] kv get', v);
  if (!v || v.label !== 'curious') throw new Error('kv mismatch');

  console.log('[smoke] log append x3');
  await logAppend(stream, { utterance: 'first' });
  await logAppend(stream, { utterance: 'second' });
  await logAppend(stream, { utterance: 'third' });
  const log = await logRead(stream);
  console.log('[smoke] log entries', log.length);
  if (log.length !== 3) throw new Error('log length mismatch');

  console.log('[smoke] all green');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
