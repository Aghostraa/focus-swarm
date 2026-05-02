#!/usr/bin/env bash
set -euo pipefail

TASK="$(node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('e2e-kit/demo.config.json','utf8')); console.log(c.task)")"

PROTOCOL_TWINS_TASK="$TASK" pnpm -F @cortex/kit protocol-twins
