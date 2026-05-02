# Local KV Setup & Testing

Once `zgs_kv` build completes, follow these steps:

## 1. Start zgs_kv (Terminal 1)
```bash
source ~/.cargo/env
source /Users/ahoura/Documents/dev-projects/focus-swarm/.env.local
cd ~/0g-storage-kv/run
../target/release/zgs_kv --config config.toml
```

Wait for output:
```
Starting RPC server at 0.0.0.0:6789
```

## 2. Initialize Profile (Terminal 2)
```bash
cd /Users/ahoura/Documents/dev-projects/focus-swarm
source .env.local
pnpm -F @cortex/apply profile:init
```

Expected output:
```
✓ Profile initialized in 0G KV
✓ Replicas=3 — data will sync to public KV node within ~5 min
✓ Ready: pnpm twin
```

## 3. Start Apply Twin (Terminal 2, after profile init)
```bash
pnpm -F @cortex/apply twin
```

Should see:
```
Apply Twin running on http://127.0.0.1:9013
MCP server listening...
```

## 4. Test in Claude Code
1. Open Claude Code
2. Use `/mcp` to connect to apply twin
3. Test `getDraftCoverLetter` with job description

## 5. Verify Profile Loaded
Check logs show profile successfully loaded from KV during generation.
