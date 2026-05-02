import hre from 'hardhat';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const signers = await hre.ethers.getSigners?.() ?? [];
  if (!signers.length) throw new Error('No signers available');
  const deployer = signers[0];
  const out = path.resolve(__dirname, '../../../infra/deploy/addresses.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const cur = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};

  // Deploy MintPersona only if not already deployed
  if (!cur.MintPersona) {
    const F = await hre.ethers.getContractFactory('MintPersona');
    const c: any = await F.deploy();
    await c.waitForDeployment();
    const addr = c.address || c.target;
    console.log('MintPersona deployed:', addr);
    cur.MintPersona = addr;
  } else {
    console.log('MintPersona already deployed:', cur.MintPersona);
  }

  // Deploy OffchainResolver (gateway URL + array of authorized signers)
  const gatewayUrl = process.env.ENS_GATEWAY_URL || 'http://localhost:8787/ccip/{sender}/{data}';
  const signerAddress = process.env.ENS_GATEWAY_SIGNER_ADDRESS || deployer.address;
  const F2 = await hre.ethers.getContractFactory('OffchainResolver');
  const c2: any = await F2.deploy(gatewayUrl, [signerAddress]);
  await c2.waitForDeployment();
  const addr2 = c2.address || c2.target;
  console.log('OffchainResolver deployed:', addr2);
  console.log('  Gateway URL:', gatewayUrl);
  console.log('  Authorized signer:', signerAddress);
  cur.OffchainResolver = addr2;

  cur.network = hre.network.name;
  cur.chainId = hre.network.config.chainId;
  fs.writeFileSync(out, JSON.stringify(cur, null, 2));
  console.log('wrote', out);
}
main().catch(e => { console.error(e); process.exit(1); });
