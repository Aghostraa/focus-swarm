import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import { config as loadDotenv } from 'dotenv';
import path from 'path';

// .env lives at repo root; __dirname = packages/contracts
loadDotenv({ path: path.resolve(__dirname, '../../.env') });

const config: HardhatUserConfig = {
  solidity: { version: '0.8.27', settings: { evmVersion: 'cancun', optimizer: { enabled: true, runs: 200 } } },
  networks: {
    galileo: {
      url: process.env.ZG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai',
      chainId: Number(process.env.ZG_CHAIN_ID ?? 16602),
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
export default config;
