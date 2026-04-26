// Verified Qwen chat against 0G Compute testnet.
// Requires PRIVATE_KEY funded (depositFund needs ≥3 0G).
import { ensureFunded, chat, findProvider } from '../src/compute.js';

async function main() {
  console.log('[smoke] ensure funded');
  await ensureFunded(3);

  console.log('[smoke] discover provider');
  const p = await findProvider('qwen-2.5-7b-instruct');
  console.log('[smoke] provider', p);

  console.log('[smoke] chat');
  const r = await chat([
    { role: 'system', content: 'You are an archetype generator. Reply in one sentence.' },
    { role: 'user', content: 'Describe a Gen-Z renter in Berlin who uses BeReal.' },
  ]);
  console.log('[smoke] reply:', r.text.slice(0, 240));
  console.log('[smoke] verified:', r.verified, 'chatId:', r.chatId);
  if (!r.verified) throw new Error('TeeML verification failed');
  console.log('[smoke] compute OK');
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
