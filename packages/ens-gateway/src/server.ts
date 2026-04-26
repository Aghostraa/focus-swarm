// CCIP-read offchain ENS resolver gateway.
// Parent domain (focusgroup.eth) on L1 points its resolver at OffchainResolver.sol,
// which reverts OffchainLookup pointing here. We respond with signed records.
//
// Pattern: gskril/ens-offchain-registrar.
// TODO(phase2): wire real EIP-3668 signing + viem-compatible response shape.

import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'url';
import express from 'express';
import Database from 'better-sqlite3';
import path from 'node:path';

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

const app = express();
app.use(express.json());

app.post('/set', (req, res) => {
  const { name, addresses, texts } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });

  const row = db.prepare('SELECT addr, texts FROM records WHERE name = ?').get(name) as any;
  const cur = row ? { addr: row.addr, texts: JSON.parse(row.texts) } : { addr: null, texts: {} };
  const newAddr = addresses?.[60] ?? cur.addr;
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

// EIP-3668 callback endpoint — to be implemented in phase 2 (signing + ABI encoding per OffchainResolver).
app.get('/ccip/:sender/:data', (_req, res) => {
  res.status(501).json({ error: 'TODO phase2: EIP-3668 signed response' });
});

const port = Number(process.env.ENS_GATEWAY_PORT ?? 8787);
app.listen(port, () => console.log(`[ens-gateway] :${port}, db=${dbPath}`));
