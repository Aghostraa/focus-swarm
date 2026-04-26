#!/usr/bin/env bash
# Spawn N AXL nodes locally with distinct identities + ports + bootstrap mesh.
# Usage: bash infra/axl/spawn.sh <N>
#   N counts persona nodes. Always boots 1 extra moderator at slot 0.
#   So total nodes = N + 1.
#
# Per-node port allocation (i = slot index 0..N):
#   tls listener (host, Yggdrasil peer): 9101 + i*10
#   api_port (host, HTTP bridge):        9002 + i*10
#   router_port (host, MCP):             9003 + i*10
#   a2a_port  (host, A2A):               9004 + i*10
#   tcp_port: kept at default 7000 — inside-Yggdrasil port, all nodes share it.
#
# Pubkeys + ports written to infra/axl/peers.local.json after boot.
set -euo pipefail

N="${1:-3}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$ROOT/infra/axl/bin/node"
KEYS="$ROOT/infra/axl/keys"
CFGS="$ROOT/infra/axl/configs"
LOGS="$ROOT/infra/axl/logs"
PEER_FILE="$ROOT/infra/axl/peers.local.json"

mkdir -p "$KEYS" "$CFGS" "$LOGS"

if [[ ! -x "$BIN" ]]; then
  echo "AXL binary missing at $BIN"
  echo "Build it: (cd ../0g-doc/axl && make build && cp ./node \"$BIN\")"
  exit 1
fi

NODES=$((N + 1))

for i in $(seq 0 $((NODES-1))); do
  KEY="$KEYS/node-$i.pem"
  [[ -f "$KEY" ]] || openssl genpkey -algorithm ed25519 -out "$KEY"
done

for i in $(seq 0 $((NODES-1))); do
  TLS_PORT=$((9101 + i*10))
  API_PORT=$((9002 + i*10))
  ROUTER_PORT=$((9003 + i*10))
  A2A_PORT=$((9004 + i*10))
  PEERS="[]"
  [[ "$i" -gt 0 ]] && PEERS='["tls://127.0.0.1:9101"]'
  cat > "$CFGS/node-$i.local.json" <<EOF
{
  "PrivateKeyPath": "$KEYS/node-$i.pem",
  "Listen": ["tls://127.0.0.1:$TLS_PORT"],
  "Peers": $PEERS,
  "api_port": $API_PORT,
  "router_addr": "http://127.0.0.1",
  "router_port": $ROUTER_PORT,
  "a2a_addr": "http://127.0.0.1",
  "a2a_port": $A2A_PORT,
  "bridge_addr": "127.0.0.1"
}
EOF
done

echo "Booting $NODES AXL nodes (1 moderator + $N personas)..."

echo "  node-0 (moderator) — bootstrap"
"$BIN" -config "$CFGS/node-0.local.json" > "$LOGS/node-0.log" 2>&1 &
echo $! > "$LOGS/node-0.pid"
sleep 2

for i in $(seq 1 $((NODES-1))); do
  echo "  node-$i (persona)"
  "$BIN" -config "$CFGS/node-$i.local.json" > "$LOGS/node-$i.log" 2>&1 &
  echo $! > "$LOGS/node-$i.pid"
  sleep 1
done

echo "Resolving pubkeys via /topology..."
sleep 2

PEERS_JSON="["
FIRST=1
for i in $(seq 0 $((NODES-1))); do
  API_PORT=$((9002 + i*10))
  PUB=""
  for try in 1 2 3 4 5 6 7 8; do
    PUB=$(curl -s "http://127.0.0.1:$API_PORT/topology" 2>/dev/null | grep -o '"our_public_key":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
    [[ -n "$PUB" ]] && break
    sleep 1
  done
  if [[ -z "$PUB" ]]; then
    echo "WARN: node-$i did not return pubkey — see $LOGS/node-$i.log"
    continue
  fi
  if [[ "$i" -eq 0 ]]; then
    ROLE="moderator"; TOKEN_ID="moderator"
  else
    ROLE="persona"; TOKEN_ID="persona-$((i-1))"
  fi
  if [[ $FIRST -eq 1 ]]; then FIRST=0; else PEERS_JSON+=","; fi
  PEERS_JSON+=$'\n  '"{\"tokenId\":\"$TOKEN_ID\",\"role\":\"$ROLE\",\"peerId\":\"$PUB\",\"apiPort\":$API_PORT}"
done
PEERS_JSON+=$'\n]\n'
printf '%s' "$PEERS_JSON" > "$PEER_FILE"

echo
echo "Cohort up. Peer manifest at $PEER_FILE"
cat "$PEER_FILE"
echo
echo "Stop all: cat $LOGS/*.pid | xargs kill"
