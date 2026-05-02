#!/usr/bin/env tsx
// Mint all 3 protocol twins as iNFTs on Galileo testnet.
// Uploads plaintext brains to 0G Storage, mints ERC-7857 tokens, registers ENS subnames.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import {
  uploadPlain,
  signer,
  RPC_URL,
  CHAIN_ID,
} from '@cortex/core';
import {
  registerAgentEns,
  agentEnsTextRecords,
  loadSkillDirectory,
} from '@cortex/kit';
import type { TwinConfig } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.resolve(__dirname, '../../kit/examples/protocol-twins/agents');
const INFT_CONTRACT = '0x1f45C631456f55dA565fCb5e8e063a0dD4B6380B'; // Deployed on Galileo
const INFT_ABI = [
  'function mint(address to, string calldata encryptedURI_, bytes32 metadataHash_) public returns (uint256)',
  'event PersonaMinted(uint256 indexed tokenId, address indexed owner, string encryptedURI, bytes32 metadataHash)',
];

interface MintManifest {
  network: string;
  chainId: number;
  twins: Array<{
    name: string;
    ensName: string;
    protocol: string;
    tokenId?: number;
    brainRootHash: string;
    encryptionKey?: string;
    txHash?: string;
    mintedAt?: number;
  }>;
  mintedAt: number;
}

function loadTwinConfigs(): TwinConfig[] {
  if (!fs.existsSync(agentsDir)) {
    throw new Error(`Agents dir not found: ${agentsDir}`);
  }
  return fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.json'))
    .map((f, i) => {
      const raw = JSON.parse(fs.readFileSync(path.join(agentsDir, f), 'utf8'));
      const base = Number(process.env.AXL_BASE_PORT ?? 9002);
      const stride = Number(process.env.AXL_PORT_STRIDE ?? 10);
      return {
        ...raw,
        slotIndex: i,
        axlApiUrl: raw.axlApiUrl ?? `http://127.0.0.1:${base + i * stride}`,
        axlMcpUrl: raw.axlMcpUrl ?? `http://127.0.0.1:${base + i * stride + 1}`,
      } as TwinConfig;
    });
}

async function createTwinBrain(config: TwinConfig): Promise<Buffer> {
  // Load skills for this twin
  const skillDir = process.env.SKILL_DIR ?? '.claude/skills';
  let skills: any[] = [];
  try {
    const allSkills = await loadSkillDirectory(skillDir);
    skills = allSkills.filter(s => config.skills?.includes(s.name));
  } catch (e) {
    console.warn(`[mint] skill load failed for ${config.name}:`, (e as Error).message);
  }

  // Create agent brain structure
  const brain = {
    identity: {
      name: config.name,
      ensName: config.ensName,
      protocol: config.protocol,
      mission: config.mission,
      boundaries: config.boundaries ?? [],
    },
    skills: skills.map(s => ({
      name: s.name,
      version: s.version,
      description: s.description,
      triggers: s.triggers,
      installedAt: Date.now(),
      enabled: true,
    })),
    memory: {
      episodic: [],
      semantic: [],
      procedural: [],
    },
    integrations: {
      brainRootHash: '',
      axlPeerId: '',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return Buffer.from(JSON.stringify(brain, null, 2), 'utf8');
}

async function mintTwin(config: TwinConfig, manifest: MintManifest): Promise<void> {
  console.log(`\n[mint:${config.name}] starting iNFT mint...`);

  try {
    // 1. Create and upload brain
    console.log(`[mint:${config.name}] creating brain...`);
    const brainBytes = await createTwinBrain(config);
    console.log(`[mint:${config.name}] uploading brain to 0G Storage...`);
    const { rootHash } = await uploadPlain(brainBytes);
    console.log(`[mint:${config.name}] brain uploaded: ${rootHash}`);

    // 2. Mint iNFT
    console.log(`[mint:${config.name}] minting ERC-7857 token...`);
    const wallet = signer();
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const inftContract = new ethers.Contract(INFT_CONTRACT, INFT_ABI, wallet.connect(provider));

    const metadataHash = ethers.id(JSON.stringify({
      name: config.name,
      protocol: config.protocol,
      mission: config.mission,
    }));

    const mintTx = await inftContract.mint(wallet.address, rootHash, metadataHash);
    const receipt = await mintTx.wait();

    if (!receipt) {
      throw new Error('Mint transaction failed: no receipt');
    }

    // Extract tokenId from event logs
    const mintEvent = receipt.logs
      .map(log => {
        try {
          return inftContract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find(e => e?.name === 'PersonaMinted');

    if (!mintEvent) {
      throw new Error('Mint event not found in receipt');
    }

    const tokenId = Number(mintEvent.args[0]);
    console.log(`[mint:${config.name}] minted token ${tokenId} at tx ${receipt.hash}`);

    // 3. Register ENS
    if (config.ensName) {
      console.log(`[mint:${config.name}] registering ENS: ${config.ensName}...`);
      try {
        await registerAgentEns({
          ensName: config.ensName,
          texts: agentEnsTextRecords({
            protocol: config.protocol,
            brainRootHash: rootHash,
            inft: `${INFT_CONTRACT}:${tokenId}`,
          }),
        });
        console.log(`[mint:${config.name}] ENS registered`);
      } catch (e) {
        console.warn(`[mint:${config.name}] ENS registration failed (non-fatal):`, (e as Error).message);
      }
    }

    // Record in manifest
    const entry = manifest.twins.find(t => t.ensName === config.ensName);
    if (entry) {
      entry.tokenId = tokenId;
      entry.brainRootHash = rootHash;
      entry.txHash = receipt.hash;
      entry.mintedAt = Date.now();
    }

    console.log(`[mint:${config.name}] ✓ complete`);
  } catch (e) {
    console.error(`[mint:${config.name}] FAILED:`, (e as Error).message);
    throw e;
  }
}

async function main() {
  console.log(`[mint] protocol twins iNFT mint`);
  console.log(`[mint] network: Galileo (chainId ${CHAIN_ID})`);
  console.log(`[mint] contract: ${INFT_CONTRACT}`);

  const configs = loadTwinConfigs();
  console.log(`[mint] found ${configs.length} twin configs`);

  const manifest: MintManifest = {
    network: 'galileo',
    chainId: CHAIN_ID,
    twins: configs.map(c => ({
      name: c.name,
      ensName: c.ensName ?? '',
      protocol: c.protocol ?? '',
      brainRootHash: '',
    })),
    mintedAt: Date.now(),
  };

  // Mint each twin
  for (const config of configs) {
    try {
      await mintTwin(config, manifest);
    } catch (e) {
      console.error(`[mint] stopping on error: ${(e as Error).message}`);
      process.exit(1);
    }
  }

  // Write manifest
  const manifestPath = path.resolve(__dirname, '../protocol-twins-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n[mint] ✓ all twins minted`);
  console.log(`[mint] manifest: ${manifestPath}`);

  // Print summary
  console.log('\n[mint] Summary:');
  for (const entry of manifest.twins) {
    if (entry.tokenId) {
      console.log(`  ${entry.ensName}: tokenId=${entry.tokenId}, brain=${entry.brainRootHash}`);
    }
  }
}

main().catch(e => {
  console.error('[mint] Fatal error:', e);
  process.exit(1);
});
