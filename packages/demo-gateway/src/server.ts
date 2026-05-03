import express from 'express';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});
app.options('*', (_req, res) => res.status(204).end());

const TWINS = [
  {
    key: 'zerog',
    name: 'zerog-builder',
    ensName: 'zerog-builder.cortex.eth',
    protocol: '0G',
    httpUrl: process.env.ZEROG_TWIN_URL ?? 'http://127.0.0.1:9013',
    axlUrl: process.env.ZEROG_AXL_URL ?? 'http://127.0.0.1:9022',
    question: 'How should a protocol buddy store its persistent brain and session memory on 0G?',
  },
  {
    key: 'axl',
    name: 'axl-builder',
    ensName: 'axl-builder.cortex.eth',
    protocol: 'AXL',
    httpUrl: process.env.AXL_TWIN_URL ?? 'http://127.0.0.1:9023',
    axlUrl: process.env.AXL_NODE_URL ?? 'http://127.0.0.1:9002',
    question: 'How should protocol buddies exchange integration context without a central broker?',
  },
  {
    key: 'ens',
    name: 'ens-builder',
    ensName: 'ens-builder.cortex.eth',
    protocol: 'ENS',
    httpUrl: process.env.ENS_TWIN_URL ?? 'http://127.0.0.1:9033',
    axlUrl: process.env.ENS_AXL_URL ?? 'http://127.0.0.1:9012',
    question: 'Which ENS text records make an agent discoverable and resumable?',
  },
];

const ensGateway = process.env.ENS_GATEWAY_URL ?? 'http://127.0.0.1:8787';

async function getJson(url: string, timeoutMs = 2500) {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    return { ok: res.ok, data, error: res.ok ? undefined : `HTTP ${res.status}`, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, error: (e as Error).message, ms: Date.now() - started };
  }
}

async function postJson(url: string, body: unknown, timeoutMs = 45000) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, data, error: res.ok ? undefined : `HTTP ${res.status}`, ms: Date.now() - started };
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

app.get('/health', (_req, res) => {
  res.json({ ok: true, checkedAt: new Date().toISOString() });
});

app.get('/status', async (_req, res) => {
  const root = repoRoot();
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

  res.json({
    checkedAt: new Date().toISOString(),
    ensGateway: { url: ensGateway, personas },
    twins,
    artifacts: {
      protocolDemo: readJsonFile(path.join(root, 'infra/deploy/protocol-twins/latest-demo.json')),
      protocolManifest: readJsonFile(path.join(root, 'packages/protocol-twins/protocol-twins-manifest.json')),
      persistentManifest: readJsonFile(path.join(root, 'infra/deploy/persistent-agents/latest.json')),
      latestFocusReport: newestReport(root),
    },
  });
});

app.post('/ask', async (req, res) => {
  const question = typeof req.body?.question === 'string' && req.body.question.trim() ? req.body.question.trim() : undefined;
  const results = await Promise.all(TWINS.map((twin) => postJson(`${twin.httpUrl}/ask`, {
    message: question || twin.question,
    context: 'Live Cortex judging demo. Answer briefly and mention the concrete repo integration.',
  }, 75000).then((result) => ({
    ok: result.ok,
    name: twin.name,
    protocol: twin.protocol,
    question: question || twin.question,
    data: result.data,
    error: result.error,
    ms: result.ms,
  }))));
  res.json({ checkedAt: new Date().toISOString(), results });
});

app.post('/project', async (req, res) => {
  const description =
    typeof req.body?.description === 'string' && req.body.description.trim()
      ? req.body.description.trim()
      : 'Build a Cortex protocol buddy that stores brain state on 0G, discovers peers through ENS, and coordinates integration plans over AXL.';
  const projectId =
    typeof req.body?.projectId === 'string' && req.body.projectId.trim()
      ? req.body.projectId.trim()
      : `ui-${Date.now().toString(36)}`;
  const waitMs = Number.isFinite(Number(req.body?.waitMs)) ? Math.max(0, Math.min(15000, Number(req.body.waitMs))) : 3500;

  const declarations = await Promise.all(TWINS.map((twin) => postJson(`${twin.httpUrl}/project`, { projectId, description }, 45000)
    .then((result) => ({ ok: result.ok, name: twin.name, protocol: twin.protocol, data: result.data, error: result.error, ms: result.ms }))));

  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

  const sessions = await Promise.all(TWINS.map((twin) => getJson(`${twin.httpUrl}/session/${encodeURIComponent(projectId)}`, 8000)
    .then((result) => ({ ok: result.ok, name: twin.name, protocol: twin.protocol, data: result.data, error: result.error, ms: result.ms }))));

  res.json({ checkedAt: new Date().toISOString(), projectId, description, declarations, sessions });
});

app.get('/session/:projectId', async (req, res) => {
  const projectId = req.params.projectId;
  const [sessions, evolutions] = await Promise.all([
    Promise.all(TWINS.map((twin) => getJson(`${twin.httpUrl}/session/${encodeURIComponent(projectId)}`, 8000)
      .then((result) => ({ ...twin, ...result })))),
    Promise.all(TWINS.map((twin) => getJson(`${twin.httpUrl}/evolution-status`, 3000)
      .then((result) => ({ ...twin, ...result })))),
  ]);
  res.json({ checkedAt: new Date().toISOString(), projectId, sessions, evolutions });
});

app.post('/followup', async (req, res) => {
  const message =
    typeof req.body?.message === 'string' && req.body.message.trim()
      ? req.body.message.trim()
      : '';
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : undefined;

  if (!message) {
    res.status(400).json({ error: 'missing message' });
    return;
  }

  const results = await Promise.all(
    TWINS.map((twin) =>
      postJson(
        `${twin.httpUrl}/evolve`,
        { failureMessage: message, projectId },
        120000,
      ).then((result) => ({
        protocol: twin.protocol,
        name: twin.name,
        ok: result.ok,
        data: result.data,
        error: result.error,
        ms: result.ms,
      })),
    ),
  );

  res.json({ checkedAt: new Date().toISOString(), message, projectId, results });
});

app.post('/plan', async (req, res) => {
  const description =
    typeof req.body?.description === 'string' && req.body.description.trim()
      ? req.body.description.trim()
      : 'Build a Cortex protocol buddy that stores brain state on 0G, discovers peers through ENS, and coordinates integration plans over AXL.';

  const twinPlans = await Promise.all(
    TWINS.map((twin) =>
      postJson(
        `${twin.httpUrl}/ask`,
        {
          message: `You are a ${twin.protocol} protocol expert building a Cortex protocol buddy. Project: "${description}"\n\nProvide a concrete 4-step implementation plan that specifically uses ${twin.protocol}. Each step: title, what to build, and the exact SDK call or method to use. Be specific and actionable.`,
          context: 'Implementation plan generation. Respond with numbered steps.',
        },
        90000,
      ).then((result) => ({
        protocol: twin.protocol,
        name: twin.name,
        ensName: twin.ensName,
        steps: result.data?.answer ?? result.error ?? 'No plan generated.',
        verified: result.data?.verified ?? false,
        ms: result.ms,
        ok: result.ok,
      })),
    ),
  );

  res.json({ checkedAt: new Date().toISOString(), description, twinPlans });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, '0.0.0.0', () => {
  console.log(`[demo-gateway] listening on 0.0.0.0:${port}`);
});
