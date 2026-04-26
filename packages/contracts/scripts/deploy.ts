import hre from 'hardhat';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const F = await hre.ethers.getContractFactory('MintPersona');
  const c = await F.deploy();
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log('MintPersona deployed:', addr);

  const out = path.resolve(__dirname, '../../../infra/deploy/addresses.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const cur = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : {};
  cur.MintPersona = addr;
  cur.network = hre.network.name;
  cur.chainId = hre.network.config.chainId;
  fs.writeFileSync(out, JSON.stringify(cur, null, 2));
  console.log('wrote', out);
}
main().catch(e => { console.error(e); process.exit(1); });
