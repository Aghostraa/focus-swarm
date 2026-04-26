import 'dotenv/config';

export const RPC_URL = process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
export const INDEXER_URL = process.env.ZG_INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai';
export const KV_NODE_URL = process.env.ZG_KV_NODE_URL ?? 'http://3.101.147.150:6789';
export const CHAIN_ID = Number(process.env.ZG_CHAIN_ID ?? 16602);
export const PRIVATE_KEY = process.env.PRIVATE_KEY ?? '';
export const COMPUTE_MODEL = process.env.ZG_COMPUTE_MODEL ?? 'qwen-2.5-7b-instruct';

if (!PRIVATE_KEY) {
  console.warn('[config] PRIVATE_KEY not set — fund via https://faucet.0g.ai');
}
