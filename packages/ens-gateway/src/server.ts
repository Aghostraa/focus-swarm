// CCIP-read offchain ENS resolver gateway (EIP-3668).
// Parent domain (cortex.eth) on L1 points its resolver at OffchainResolver.sol,
// which reverts OffchainLookup pointing here. We respond with signed records.
//
// Pattern: gskril/ens-offchain-registrar.

import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'url';
import express from 'express';
import Database from 'better-sqlite3';
import path from 'node:path';
import {
  decodeFunctionData,
  encodeAbiParameters,
  keccak256,
  concat,
  toHex,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
loadDotenv({ path: path.join(repoRoot, '.env') });

const dbPath = process.env.ENS_GATEWAY_DB
  ? path.resolve(repoRoot, process.env.ENS_GATEWAY_DB)
  : path.join(repoRoot, 'infra/deploy/ens.db');
import fs from 'node:fs';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    name TEXT PRIMARY KEY,
    addr TEXT,
    texts TEXT NOT NULL DEFAULT '{}'
  );
`);

const addressesPath = path.join(repoRoot, 'infra/deploy/addresses.json');
const addresses = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));
const DEFAULT_VERIFIER = addresses.OffchainResolver ?? '0x0000000000000000000000000000000000000000';

// Decode DNS wire-format name bytes → dot-separated label string
function decodeDnsName(hex: `0x${string}`): string {
  const buf = Buffer.from(hex.slice(2), 'hex');
  const labels: string[] = [];
  let i = 0;
  while (i < buf.length) {
    const len = buf[i++];
    if (len === 0) break;
    labels.push(buf.slice(i, i + len).toString('utf8'));
    i += len;
  }
  return labels.join('.');
}

const RESOLVE_ABI = parseAbi(['function resolve(bytes name, bytes data) view returns (bytes)']);
const ADDR_ABI = parseAbi(['function addr(bytes32 node) view returns (address)']);
const TEXT_ABI = parseAbi(['function text(bytes32 node, string key) view returns (string)']);

const app = express();
app.use(express.json());

app.post('/set', (req, res) => {
  const { name, addresses: addrs, texts } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });

  const row = db.prepare('SELECT addr, texts FROM records WHERE name = ?').get(name) as any;
  const cur = row ? { addr: row.addr, texts: JSON.parse(row.texts) } : { addr: null, texts: {} };
  const newAddr = addrs?.[60] ?? cur.addr;
  const newTexts = { ...cur.texts, ...(texts ?? {}) };
  db.prepare('INSERT OR REPLACE INTO records (name, addr, texts) VALUES (?, ?, ?)')
    .run(name, newAddr, JSON.stringify(newTexts));
  res.json({ ok: true, name, addr: newAddr, texts: newTexts });
});

app.get('/lookup/:name', (req, res) => {
  const row = db.prepare('SELECT addr, texts FROM records WHERE name = ?').get(req.params.name) as any;
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json({ name: req.params.name, addr: row.addr, texts: JSON.parse(row.texts) });
});

// Persona catalog — returns all registered personas, optionally filtered by target market.
app.get('/personas', (req, res) => {
  const market = (req.query.market as string | undefined)?.toLowerCase();
  const rows = db.prepare('SELECT name, addr, texts FROM records').all() as any[];
  let personas = rows.map((r) => ({ name: r.name, addr: r.addr, ...JSON.parse(r.texts) }));
  if (market) {
    const words = market.split(/\s+/).filter(Boolean);
    personas = personas.filter((p) => {
      const tm = (p['agent.target_market'] ?? '').toLowerCase();
      return tm && words.some((w) => tm.includes(w));
    });
  }
  res.json(personas);
});

// EIP-3668 CCIP-read endpoint.
// calldata = ABI-encoded resolve(bytes name, bytes data) including selector.
app.get('/ccip/:sender/:data', async (req, res) => {
  try {
    const calldata = req.params.data as `0x${string}`;

    const { args } = decodeFunctionData({ abi: RESOLVE_ABI, data: calldata });
    const [nameBytes, innerCalldata] = args as [`0x${string}`, `0x${string}`];

    const label = decodeDnsName(nameBytes);
    const selector = innerCalldata.slice(0, 10) as string;

    const row = db.prepare('SELECT addr, texts FROM records WHERE name = ?').get(label) as any;

    let result: `0x${string}`;

    if (selector === '0x3b3b57de') {
      // addr(bytes32)
      const addr = (row?.addr ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
      result = encodeAbiParameters([{ type: 'address' }], [addr]);
    } else if (selector === '0x59d1d43c') {
      // text(bytes32, string)
      const { args: textArgs } = decodeFunctionData({ abi: TEXT_ABI, data: innerCalldata });
      const key = textArgs[1] as string;
      const texts = row ? JSON.parse(row.texts as string) : {};
      const value = (texts[key] ?? '') as string;
      result = encodeAbiParameters([{ type: 'string' }], [value]);
    } else {
      result = '0x';
    }

    const signerKey = process.env.ENS_GATEWAY_SIGNER_KEY as `0x${string}` | undefined;
    if (!signerKey) {
      return res.status(500).json({ error: 'ENS_GATEWAY_SIGNER_KEY not set' });
    }

    const verifierAddr = (process.env.ENS_GATEWAY_VERIFIER_ADDRESS ?? DEFAULT_VERIFIER) as `0x${string}`;
    const expires = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const msgHash = keccak256(
      concat([
        '0x1900',
        verifierAddr,
        toHex(expires, { size: 8 }),
        keccak256(calldata),
        keccak256(result),
      ]),
    );

    const account = privateKeyToAccount(signerKey);
    const sig = await account.sign({ hash: msgHash });

    const data = encodeAbiParameters(
      [{ type: 'bytes' }, { type: 'uint64' }, { type: 'bytes' }],
      [result, expires, sig],
    );

    res.json({ data });
  } catch (e) {
    console.error('[ccip]', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

const port = Number(process.env.ENS_GATEWAY_PORT ?? 8787);
app.listen(port, () => console.log(`[ens-gateway] :${port}, db=${dbPath}`));
