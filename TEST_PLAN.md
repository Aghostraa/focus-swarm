# Test Plan: Local zgs_kv + Apply Twin

## Build Status
- zgs_kv cargo build in progress (protoc + cmake policy installed)
- ETA: 5-15 min remaining

## Integration Test Sequence (post-build)

### Phase 1: KV Node Startup ✓ PENDING
```bash
# Terminal 1
source ~/.cargo/env
source .env.local
cd ~/0g-storage-kv/run
../target/release/zgs_kv --config config.toml
```
**Check:** Server listens on `http://localhost:6789`

### Phase 2: Profile Initialization ✓ PENDING
```bash
# Terminal 2
cd /Users/ahoura/Documents/dev-projects/focus-swarm
source .env.local
pnpm -F @cortex/apply profile:init
```
**Check:** 
- ✓ Profile loaded from local files
- ✓ Written to KV with stream ID: `0xf69e2b1eacdcd94e49a86b6f57bece2c8ba95fd3fc28c46b3cdb0234dd2f2bd`
- ✓ Replication count = 3

### Phase 3: Apply Twin Startup ✓ PENDING
```bash
# Terminal 2
pnpm -F @cortex/apply twin
```
**Check:**
- ✓ MCP server listening on `:9013`
- ✓ Can connect from Claude Code

### Phase 4: Claude Code Integration ✓ PENDING
1. Open Claude Code
2. Use `/mcp apply` or configure in settings
3. Call `apply.draft_cover_letter` with sample job description

**Expected:**
- Loads profile from local zgs_kv (not public node)
- Inference via 0G Compute (Qwen)
- TeeML verification returns true
- Generated cover letter uses profile context

### Phase 5: Verification ✓ PENDING
- [ ] KV logs show profile read request
- [ ] 0G Compute logs show Qwen inference
- [ ] Cover letter mentions profile details (not generic)
- [ ] No timeout on local KV read (< 1 sec)

## Success Criteria
- Local zgs_kv binary built without cmake/protoc errors
- Profile persists in local KV
- Apply twin reads profile from local KV instead of public node
- End-to-end cover letter generation works with local KV

## Rollback Plan
If local KV doesn't work:
1. Use public KV at `178.238.236.119:6789` (set in .env)
2. Increase replication factor further (Batcher(5, ...))
3. Manually sync profile using `kvSet` with explicit wait
