# @cortex/apply — Apply Twin

Self-twin MCP server for job search. Runs persistent on your machine, connected to Claude Desktop. Drafts tailored cover letters, researches companies, and tracks your pipeline — all via 0G Compute (TeeML) with your encrypted brain on 0G Storage.

**Package:** `packages/apply/`  
**Full setup guide:** [`packages/apply/README.md`](../../packages/apply/README.md)  
**Full env reference:** [`packages/apply/SETUP.md`](../../packages/apply/SETUP.md)

---

## Quick start

```bash
cd packages/apply
cp style-guide.template.md style-guide.md
cp profile-context.template.md profile-context.md
# Edit both files with your background + writing voice

pnpm profile:init   # encrypt + upload brain to 0G, print rootHash
pnpm twin           # start MCP server on :9013
```

Claude Desktop config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "apply": { "url": "http://127.0.0.1:9013" }
  }
}
```

Restart Claude. Then:

```
Draft a cover letter for Anthropic, Senior Engineer role.

[paste JD]
```

---

## Files you provide

| File | Purpose |
|------|---------|
| `style-guide.md` | Your writing rules — banned clichés, signoff, paragraph length |
| `profile-context.md` | Your background, skills, target roles, culture fit |
| `training-letters/*.txt` | (Optional) Past letters you're proud of — informs style |

Templates provided: `style-guide.template.md`, `profile-context.template.md`.

---

## MCP tools

| Tool | Inputs | Description |
|------|--------|-------------|
| `apply.draft_cover_letter` | `company`, `role`, `jd` | Generate tailored letter via 0G Compute |
| `apply.research_company` | `company` | Company culture + strategic direction |
| `apply.track_application` | `company`, `role`, `status`, `notes?` | Add/update in pipeline tracker |
| `apply.get_pipeline` | — | Return full tracked pipeline |
| `apply.update_profile` | `field`, `value` | Mutate stored profile in 0G KV |

Application statuses: `lead | ready | sent | rejected | interview | offer`

---

## Architecture

```
Claude Desktop
    ↓ JSON-RPC 2.0
Apply Twin MCP Server (:9013)
    ├── style-guide.md + profile-context.md (local disk)
    ├── Encrypted brain (AES-256) ← 0G Storage
    ├── Application pipeline ← 0G KV
    └── verifiedReason() → 0G Compute (TeeML, Qwen)
```

Hard invariants:
- All inference via 0G Compute — never OpenAI/Anthropic
- Brain encrypted with AES-256 before 0G Storage upload
- Profile files stay local (not uploaded)
- Memory persists in 0G KV across sessions

---

## Key scripts

```bash
pnpm profile:init   # build + encrypt brain, upload to 0G
pnpm twin           # start MCP server
pnpm cli            # interactive CLI (init, upload, check status)
```

---

## Environment variables

Minimum required:

```env
PRIVATE_KEY=0x<your-0g-key>
ZEROG_BROKER_URL=<broker-url>
```

Optional:

```env
APPLY_MCP_PORT=9013
APPLY_ENS_NAME=apply.cortex.eth
AXL_API_URL=http://127.0.0.1:9012
```

---

## Troubleshooting

**Port in use:** `lsof -ti:9013 | xargs kill -9`

**Profile not loading:** files must be named exactly `style-guide.md` and `profile-context.md` in `packages/apply/`.

**Generic letters:** add more specific writing rules to `style-guide.md` and add past letters to `training-letters/`.

Full troubleshooting: `packages/apply/SETUP.md`
