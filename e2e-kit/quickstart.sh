#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

./e2e-kit/scripts/00-check-env.sh
./e2e-kit/scripts/01-build.sh
./e2e-kit/scripts/03-run-protocol-agent-demo.sh
./e2e-kit/scripts/04-verify-proof-bundle.sh
