#!/usr/bin/env bash
set -euo pipefail

node <<'NODE'
const fs = require('fs');
const p = 'infra/deploy/protocol-twins/latest-demo.json';
if (!fs.existsSync(p)) throw new Error(`${p} missing`);
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
if (!data.proof) throw new Error('proof missing');
if (data.proof.schemaVersion !== 'persistent-agent-proof/v1') throw new Error('wrong proof schema');
if (!Array.isArray(data.proof.agents) || data.proof.agents.length !== 3) throw new Error('expected 3 agents');
for (const agent of data.proof.agents) {
  if (!agent.name) throw new Error('agent name missing');
  if (!Array.isArray(agent.installedSkills) || agent.installedSkills.length < 1) {
    throw new Error(`agent ${agent.name} has no installed skills`);
  }
}
console.log('proof bundle ok:', p);
NODE
