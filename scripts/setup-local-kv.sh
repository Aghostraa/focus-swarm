#!/bin/bash
# Setup local zgs_kv node pointing to 0G testnet storage nodes.
# Usage: bash scripts/setup-local-kv.sh

set -euo pipefail

# Config
KV_REPO="$HOME/0g-storage-kv"
KV_PORT="6789"

# 0G testnet
RPC_URL="https://evmrpc-testnet.0g.ai"
LOG_CONTRACT="0x1F1b949A36CFF78F3A32F0dBB4FF72D1eE55e5eE"

# Our stream ID: keccak256("persistent-agent:apply-twin:state")
STREAM_ID="0xf69e2b1eacdcd94e49a86b6f57bece2c8ba95fd3fc28c46b3cdb0234dd2f2bd"

echo "Setting up local zgs_kv node..."
echo "  RPC: $RPC_URL"
echo "  Stream ID: $STREAM_ID"
echo ""

# 1. Clone/update repo
if [ ! -d "$KV_REPO" ]; then
  echo "Cloning 0g-storage-kv..."
  git clone https://github.com/0gfoundation/0g-storage-kv.git "$KV_REPO"
else
  echo "Updating 0g-storage-kv..."
  (cd "$KV_REPO" && git pull)
fi

# 2. Build
echo "Building zgs_kv (this takes 1-2 min)..."
(cd "$KV_REPO" && cargo build --release 2>&1 | grep -E "Compiling|Finished" || true)

# 3. Set storage nodes (for local dev, use standard testnet nodes)
# In production, query the indexer. For now, use public nodes that serve testnet data.
NODES="http://34.83.53.209:5678,http://34.169.28.106:5678"
echo "  Storage nodes: $NODES"

# 4. Create config
CONFIG_FILE="$KV_REPO/run/config.toml"
echo "Creating config at $CONFIG_FILE..."
cat > "$CONFIG_FILE" <<EOF
#######################################################################
###                   Key-Value Stream Options                      ###
#######################################################################

stream_ids = ["$STREAM_ID"]

#######################################################################
###                     DB Config Options                           ###
#######################################################################

db_dir = "db"
kv_db_dir = "kv.DB"

#######################################################################
###                     Log Sync Config Options                     ###
#######################################################################

blockchain_rpc_endpoint = "$RPC_URL"
log_contract_address = "$LOG_CONTRACT"
log_sync_start_block_number = 0

#######################################################################
###                     RPC Config Options                          ###
#######################################################################

rpc_enabled = true
rpc_listen_address = "0.0.0.0:$KV_PORT"
zgs_node_urls = "$NODES"

#######################################################################
###                     Misc Config Options                         ###
#######################################################################

log_config_file = "log_config"
EOF

# 5. Run
echo ""
echo "Starting zgs_kv on :$KV_PORT..."
echo "  Stream ID: $STREAM_ID"
echo "  Storage nodes: $NODES"
echo ""
echo "Stop with: Ctrl+C"
echo ""
cd "$KV_REPO/run"
../target/release/zgs_kv --config config.toml
