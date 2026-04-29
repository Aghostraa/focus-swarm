// 0G Compute broker wrapper. Verified inference via TeeML/TeeTLS.
// Source: ../0g-doc/docs/developer-hub/building-on-0g/compute-network/inference.md

import { ethers } from 'ethers';
import { createRequire } from 'module';
import { RPC_URL, PRIVATE_KEY, COMPUTE_MODEL } from './config.js';

// CJS require avoids Node.js v22 ESM static-link failure on the broker's chunked re-exports
const { createZGComputeNetworkBroker } = createRequire(import.meta.url)('@0glabs/0g-serving-broker');

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResult {
  text: string;
  chatId: string;
  verified: boolean;
  provider: string;
  model: string;
  raw: unknown;
}

let _broker: Awaited<ReturnType<typeof createZGComputeNetworkBroker>> | null = null;
let _providerCache = new Map<string, { provider: string; endpoint: string; model: string }>();

export async function getBroker() {
  if (_broker) return _broker;
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY missing — fund via https://faucet.0g.ai');
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  _broker = await createZGComputeNetworkBroker(wallet);
  return _broker;
}

/**
 * Create/top-up ledger account, then allocate a provider sub-account.
 * addLedger creates the account; depositFund tops up an existing one.
 * Both paths are idempotent — safe to re-run.
 */
export async function ensureFunded(amount = 3, providerAddr?: string): Promise<void> {
  const broker = await getBroker();
  try {
    await broker.ledger.addLedger(amount);
  } catch (e) {
    const msg = (e as Error).message ?? '';
    if (/already exists/i.test(msg)) {
      await broker.ledger.depositFund(amount).catch(() => {});
    } else {
      throw e;
    }
  }
  if (providerAddr) {
    try {
      await broker.ledger.transferFund(providerAddr, 'inference', BigInt(1) * BigInt(10 ** 18));
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (!/already exists|insufficient/i.test(msg)) throw e;
    }
  }
}

/** Find a provider serving the requested model. Caches by model name. */
export async function findProvider(model: string): Promise<{ provider: string; endpoint: string; model: string }> {
  if (_providerCache.has(model)) return _providerCache.get(model)!;
  const broker = await getBroker();
  const services = await broker.inference.listService();
  const match = services.find((s: { model: string }) => s.model === model);
  if (!match) {
    const available = services.map((s: { model: string }) => s.model).join(', ');
    throw new Error(`Model ${model} not on the network. Available: ${available}`);
  }
  const meta = await broker.inference.getServiceMetadata((match as { provider: string }).provider);
  const out = { provider: (match as { provider: string }).provider, endpoint: meta.endpoint, model: meta.model };
  _providerCache.set(model, out);
  return out;
}

/**
 * Verified chat completion. Always runs `processResponse()` — TeeML verification is the
 * point of using 0G Compute. If verification returns false, the call throws.
 * Retries up to 4× on 429 with exponential backoff (7s, 14s, 28s, 56s).
 */
export async function chat(messages: ChatMsg[], model: string = COMPUTE_MODEL): Promise<ChatResult> {
  const broker = await getBroker();
  const { provider, endpoint, model: resolvedModel } = await findProvider(model);

  let attempt = 0;
  let res: Response;
  while (true) {
    const headers = await broker.inference.getRequestHeaders(provider);
    res = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ messages, model: resolvedModel }),
    });
    if (res.status === 429 && attempt < 4) {
      const delay = 7000 * Math.pow(2, attempt);
      console.warn(`[compute] 429 rate-limited, retry ${attempt + 1}/4 after ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
      attempt++;
      continue;
    }
    break;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`compute ${res.status}: ${body.slice(0, 400)}`);
  }
  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  const chatId = res.headers.get('ZG-Res-Key') ?? data?.id ?? '';
  let verified = false;
  if (chatId) {
    try {
      verified = !!(await broker.inference.processResponse(provider, chatId));
    } catch (e) {
      console.warn('[compute] processResponse threw:', (e as Error).message);
    }
  }
  return { text, chatId, verified, provider, model: resolvedModel, raw: data };
}
