#!/usr/bin/env bash
set -euo pipefail

command -v pnpm >/dev/null || { echo "pnpm is required"; exit 1; }
command -v node >/dev/null || { echo "node is required"; exit 1; }

test -d .claude/skills || { echo ".claude/skills missing"; exit 1; }
test -f packages/kit/package.json || { echo "packages/kit missing"; exit 1; }

echo "env ok"
