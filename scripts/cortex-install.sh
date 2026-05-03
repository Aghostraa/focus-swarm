#!/usr/bin/env bash
# Cortex DevBuddy — Curl-installable bootstrap script
# Usage: curl cortex.sh/install | bash

set -euo pipefail

# Configuration
REPO="${CORTEX_REPO:-https://github.com/gensyn/focus-swarm}"
DIR="${CORTEX_DIR:-$HOME/.cortex}"

echo "🔧 Cortex DevBuddy Installation"
echo "================================"
echo ""

# Prerequisites
echo "[1/4] Checking prerequisites..."
if ! command -v node &>/dev/null; then
  echo "  ✗ Node.js not found (need 18+)"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "  ✗ Node.js $NODE_VERSION found (need 18+)"
  exit 1
fi
echo "  ✓ Node.js $(node -v)"

if ! command -v pnpm &>/dev/null; then
  echo "  Installing pnpm..."
  npm install -g pnpm@latest
fi
echo "  ✓ pnpm $(pnpm -v)"

# Clone or update
echo ""
echo "[2/4] Setting up repository..."
if [ -d "$DIR/.git" ]; then
  echo "  Updating $DIR..."
  cd "$DIR"
  git pull
else
  echo "  Cloning from $REPO..."
  git clone "$REPO" "$DIR"
  cd "$DIR"
fi
echo "  ✓ Repository ready at $DIR"

# Install dependencies
echo ""
echo "[3/4] Installing dependencies..."
pnpm install --quiet
echo "  ✓ Dependencies installed"

# Link CLI globally
echo ""
echo "[4/4] Setting up CLI..."
pnpm link --global packages/cli
echo "  ✓ CLI linked globally"

echo ""
echo "✓ Installation complete!"
echo ""
echo "Next steps:"
echo "  cortex init      # Bootstrap infrastructure"
echo "  cortex discover  # List available agents"
echo "  cortex project \"Build a voting app\"  # Start orchestration"
