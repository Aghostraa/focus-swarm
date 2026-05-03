import { NextResponse } from 'next/server';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { demoApiBase, proxyDemo } from '../_proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TWINS = [
  {
    key: 'zerog',
    name: 'zerog-builder',
    ensName: 'zerog-builder.cortex.eth',
    protocol: '0G',
    httpUrl: 'http://127.0.0.1:9013',
    axlUrl: 'http://127.0.0.1:9022',
  },
  {
    key: 'axl',
    name: 'axl-builder',
    ensName: 'axl-builder.cortex.eth',
    protocol: 'AXL',
    httpUrl: 'http://127.0.0.1:9023',
    axlUrl: 'http://127.0.0.1:9002',
  },
  {
    key: 'ens',
    name: 'ens-builder',
    ensName: 'ens-builder.cortex.eth',
    protocol: 'ENS',
    httpUrl: 'http://127.0.0.1:9033',
    axlUrl: 'http://127.0.0.1:9012',
  },
];

async function getJson(url: string, timeoutMs = 2500): Promise<{ ok: boolean; data?: unknown; error?: string; ms: number }> {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) return { ok: false, data, error: `HTTP ${res.status}`, ms: Date.now() - started };
    return { ok: true, data, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, error: (e as Error).message, ms: Date.now() - started };
  }
}

function repoRoot(): string {
  let cur = process.cwd();
  while (cur !== path.dirname(cur)) {
    if (existsSync(path.join(cur, 'pnpm-workspace.yaml'))) return cur;
    cur = path.dirname(cur);
  }
  return process.cwd();
}

function readJsonFile(filePath: string): unknown | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function newestReport(root: string): unknown | null {
  const dir = path.join(root, 'infra/deploy/reports');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.report.json'))
    .map((f) => path.join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ? readJsonFile(files[0]) : null;
}

export async function GET() {
  if (demoApiBase()) return proxyDemo('/status');

  const root = repoRoot();
  const ensGateway = process.env.ENS_GATEWAY_URL ?? 'http://127.0.0.1:8787';

  const [personas, ...twinResults] = await Promise.all([
    getJson(`${ensGateway}/personas`, 2500),
    ...TWINS.flatMap((twin) => [
      getJson(`${twin.httpUrl}/capabilities`, 2500),
      getJson(`${twin.httpUrl}/evolution-status`, 2500),
      getJson(`${twin.axlUrl}/topology`, 2500),
      getJson(`${ensGateway}/lookup/${encodeURIComponent(twin.ensName)}`, 2500),
    ]),
  ]);

  const twins = TWINS.map((twin, index) => {
    const base = index * 4;
    return {
      ...twin,
      capabilities: twinResults[base],
      evolution: twinResults[base + 1],
      topology: twinResults[base + 2],
      ens: twinResults[base + 3],
    };
  });

  const protocolDemo = readJsonFile(path.join(root, 'infra/deploy/protocol-twins/latest-demo.json'));
  const protocolManifest = readJsonFile(path.join(root, 'packages/protocol-twins/protocol-twins-manifest.json'));
  const persistentManifest = readJsonFile(path.join(root, 'infra/deploy/persistent-agents/latest.json'));
  const latestFocusReport = newestReport(root);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    ensGateway: {
      url: ensGateway,
      personas,
    },
    twins,
    artifacts: {
      protocolDemo,
      protocolManifest,
      persistentManifest,
      latestFocusReport,
    },
  });
}
