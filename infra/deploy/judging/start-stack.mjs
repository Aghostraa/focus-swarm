#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const axlBin = process.env.AXL_BIN || path.join(root, 'infra/axl/bin/node-linux');
const keysDir = path.join(root, 'infra/axl/keys');
const cfgDir = path.join(root, 'infra/axl/configs');

const children = [];

function log(msg) {
  console.log(`[judging-stack] ${msg}`);
}

function requireFile(file, hint) {
  if (!existsSync(file)) {
    console.error(`[judging-stack] missing ${file}`);
    if (hint) console.error(`[judging-stack] ${hint}`);
    process.exit(1);
  }
}

function run(name, command, args, env = {}) {
  log(`starting ${name}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  child.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  child.on('exit', (code, signal) => {
    console.error(`[judging-stack] ${name} exited code=${code} signal=${signal}`);
    shutdown(code || 1);
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

requireFile(axlBin, 'Build or provide a Linux AXL binary and set AXL_BIN=/app/infra/axl/bin/node-linux.');

mkdirSync(keysDir, { recursive: true });
mkdirSync(cfgDir, { recursive: true });

for (let i = 0; i < 3; i++) {
  const keyPath = path.join(keysDir, `node-${i}.pem`);
  if (!existsSync(keyPath)) {
    execFileSync('openssl', ['genpkey', '-algorithm', 'ed25519', '-out', keyPath]);
  }
}

for (let i = 0; i < 3; i++) {
  const tlsPort = 9101 + i * 10;
  const apiPort = 9002 + i * 10;
  const routerPort = 9303 + i * 10;
  const a2aPort = 9304 + i * 10;
  const peers = i === 0 ? [] : ['tls://127.0.0.1:9101'];
  const cfg = {
    PrivateKeyPath: path.join(keysDir, `node-${i}.pem`),
    Listen: [`tls://127.0.0.1:${tlsPort}`],
    Peers: peers,
    api_port: apiPort,
    router_addr: 'http://127.0.0.1',
    router_port: routerPort,
    a2a_addr: 'http://127.0.0.1',
    a2a_port: a2aPort,
    bridge_addr: '127.0.0.1',
  };
  writeFileSync(path.join(cfgDir, `node-${i}.judging.json`), JSON.stringify(cfg, null, 2));
}

const commonEnv = {
  ENS_GATEWAY_URL: process.env.ENS_GATEWAY_URL || 'http://127.0.0.1:8787',
  AXL_MCP_BASE_PORT: '9303',
};

run('ens-gateway', 'pnpm', ['-F', '@cortex/ens-gateway', 'dev'], commonEnv);

await new Promise((resolve) => setTimeout(resolve, 1000));

run('axl-0', axlBin, ['-config', path.join(cfgDir, 'node-0.judging.json')]);
await new Promise((resolve) => setTimeout(resolve, 1200));
run('axl-1', axlBin, ['-config', path.join(cfgDir, 'node-1.judging.json')]);
await new Promise((resolve) => setTimeout(resolve, 800));
run('axl-2', axlBin, ['-config', path.join(cfgDir, 'node-2.judging.json')]);

await new Promise((resolve) => setTimeout(resolve, 2500));

run('protocol-twins', 'pnpm', ['-F', '@cortex/protocol-twins', 'start'], commonEnv);

await new Promise((resolve) => setTimeout(resolve, 2500));

run('demo-gateway', 'pnpm', ['-F', '@cortex/demo-gateway', 'start'], {
  ...commonEnv,
  PORT: process.env.PORT || '8080',
});

log('stack launch complete');
