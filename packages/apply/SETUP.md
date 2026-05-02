# Apply Twin Setup Guide

Generic, plug-and-play job search assistant. Personalize with your profile, deploy to 0G, use via Claude MCP.

## Quick Start (5 mins)

### 1. Create profile files

```bash
cd packages/apply
```

Create 4 files:

**`style-guide.md`** — Your writing rules
```markdown
# Writing Style Guide

- Voice: Direct, specific, unpolished-but-professional
- Tone: Builder mentality, evidence-based, humble
- Avoid: Generic phrases like "passionate about innovation", "dynamic team"
- Signoff: "Best, [Your Name]"
- Preferred paragraph length: 2-3 sentences
- Jargon: Use only if necessary and explained
```

**`profile-context.md`** — Your background & positioning
```markdown
# Your Professional Positioning

## Who You Are
- 10 years building [your domain] 
- Core skills: [skill 1], [skill 2], [skill 3]
- Strongest proof points: [achievement 1], [achievement 2]

## Target Roles
- Senior [role] at infrastructure/systems companies
- Focus on: [domain 1], [domain 2]

## Key Gaps
- Limited [area 1]
- No [area 2] — but learning velocity is high

## Culture Fit
- Prefer: async-first, long-term ownership, data-driven
- Avoid: waterfall process, frequent context-switching
```

**`training-letters/` folder** — Example cover letters (optional)
```
training-letters/
  CompanyA.txt
  CompanyB.txt
  CompanyC.txt
```

Each file = one past cover letter. Named by company. Used as style examples.

**`applications/tracker.json`** — Pipeline state (auto-created)
```json
{
  "applications": []
}
```

### 2. Initialize brain in 0G

```bash
pnpm profile:init
```

Loads profile files → encrypts → uploads to 0G Storage.

Prints: `Root hash: 0xabcd...`

### 3. Start apply twin

```bash
AXL_API_URL=http://127.0.0.1:9012 pnpm twin
```

Output:
```
[apply-twin] MCP server :9013
[apply-twin] Add to MCP config: { "apply": { "url": "http://127.0.0.1:9013" } }
[apply-twin] ENS: apply.cortex.eth peer=0x1234abcd...
```

### 4. Connect to Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apply": {
      "url": "http://127.0.0.1:9013"
    }
  }
}
```

Restart Claude Desktop.

### 5. Use it

In Claude, ask:
```
Draft a cover letter for Anthropic, Senior Engineer role.

[Paste full job description here]
```

Claude will:
1. Load your profile + style guide
2. Analyze the role + company
3. Draft letter using 0G Compute (not Claude)
4. Save to pipeline tracker (0G KV)

## Tools Available

| Tool | What it does |
|------|-------------|
| `draft_cover_letter` | Write tailored letter for a role |
| `research_company` | Research company culture + strategic direction |
| `track_application` | Log application (status: lead/ready/sent/rejected/interview/offer) |
| `get_pipeline` | Show all applications tracked |
| `update_profile` | Change your profile (summary/experience/skills/targetRoles/culture) |

## File Structure

```
packages/apply/
  style-guide.md          ← Your writing rules
  profile-context.md      ← Your background + positioning
  training-letters/       ← Example letters (optional)
    Company1.txt
    Company2.txt
  applications/           ← Pipeline tracker (auto-created)
    tracker.json
  src/                    ← Twin runtime + tools
    runtime.ts            ← MCP server + AXL listener
    tools.ts              ← Tool implementations
    profile.ts            ← Load + summarize profile
    agents/               ← Draft, research, analyze, check
```

## What Gets Stored Where

| What | Where | Encrypted? |
|------|-------|-----------|
| Profile files | Local disk | N/A |
| Brain (encrypted) | 0G Storage | Yes (AES-256) |
| Memory (applications, profile updates) | 0G KV | Yes (via 0G) |
| Event log | 0G Log | Yes (via 0G) |

## Environment Variables

```env
# 0G network
ZERO_G_PRIVATE_KEY=0x...
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ZERO_G_KV_NODE_URL=...
ZEROG_BROKER_URL=...

# ENS (optional, for agent discovery)
ENS_GATEWAY_URL=http://localhost:8787
ENS_GATEWAY_SIGNER_KEY=0x...
ENS_GATEWAY_VERIFIER_ADDRESS=0x...

# AXL (optional, for agent-to-agent)
AXL_API_URL=http://127.0.0.1:9012
AXL_MCP_URL=http://127.0.0.1:9003
APPLY_MCP_PORT=9013
APPLY_ENS_NAME=apply.cortex.eth
```

## Common Workflows

**Draft a cover letter:**
```
User: "Draft letter for [Company], [Role]. [Paste JD]"
Twin: Loads your profile → runs 0G Compute → generates letter
```

**Track application:**
```
User: "Track application: Company=X, Role=Y, Status=sent"
Twin: Saves to 0G KV → added to pipeline
```

**Update your profile:**
```
User: "Update skills to add [new skill]"
Twin: Updates profile in 0G → persists across sessions
```

**Research a company:**
```
User: "Research [Company] culture for this role"
Twin: Queries 0G Compute → returns insights
```

**Check your pipeline:**
```
User: "Show my applications"
Twin: Loads from 0G KV → returns all tracked apps
```

## Troubleshooting

**"Could not locate the bindings file" (better-sqlite3)**
```bash
pnpm install --force
```

**"Port 9013 already in use"**
```bash
lsof -ti:9013 | xargs kill -9
# Or use different port:
APPLY_MCP_PORT=9014 pnpm twin
```

**"ZERO_G_PRIVATE_KEY not set"**
Get testnet faucet funds: https://faucet.0g.ai
```bash
# Set in .env (repo root):
ZERO_G_PRIVATE_KEY=0x...
```

**Profile not loading**
Check file names (must be exact):
- `style-guide.md`
- `profile-context.md`
- `training-letters/` folder exists
- `applications/tracker.json` exists

## Next Steps

- **Customize profile** — Edit style-guide.md, profile-context.md
- **Add training letters** — Paste past cover letters in `training-letters/`
- **Track applications** — Use Claude to log each application
- **Iterate** — Twin learns from your feedback + applications
- **Deploy** — Consider minting as iNFT for persistence across devices

## Architecture

```
You (Claude Desktop)
    ↓ (query)
MCP Protocol :9013
    ↓
Apply Twin Runtime
    ├─ Load profile from disk
    ├─ Load brain + memory from 0G Storage
    ├─ Call tool (draft_cover_letter, etc)
    └─ Save state to 0G KV
    ↓ (inference)
0G Compute (TeeML, Qwen)
    ↓ (result)
Return to Claude
```

All inference via 0G Compute. Brain encrypted on 0G Storage.
