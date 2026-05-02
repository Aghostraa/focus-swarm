# Apply Twin — Job Search Assistant

Persistent, AI-powered job search agent. Drafts tailored cover letters, researches companies, tracks your application pipeline. Runs entirely on your encrypted brain stored on 0G — no data sent to OpenAI or Anthropic.

**Use cases:**
- Draft 10 tailored cover letters in parallel instead of 10 hours of writing
- Maintain consistent voice + positioning across all applications
- Research company culture + strategic direction for each role
- Track application status, fits, and next steps in one place
- Persistent memory across devices (encrypted on 0G Storage)

## Features

| Feature | Benefit |
|---------|---------|
| **0G-powered inference** | All drafting done via verifiable 0G Compute (Qwen LLM), no external APIs |
| **Encrypted brain** | Your profile, style guide, and memory stored encrypted on 0G Storage (AES-256) |
| **MCP integration** | Query from Claude Desktop with natural language |
| **Persistent memory** | Applications, profile updates, and history saved to 0G KV — persists across sessions |
| **Style consistency** | Your writing rules enforced (no clichés, your signoff, your voice) |
| **Plug-and-play** | Zero hardcoded company/person names — customize for any candidate |

## Quick Start

### 1. Copy template files

```bash
cd packages/apply

cp style-guide.template.md style-guide.md
cp profile-context.template.md profile-context.md

# Edit both with your background + voice
nano style-guide.md
nano profile-context.md

# (Optional) Add past cover letters as examples
mkdir -p training-letters
# Paste past letters into training-letters/CompanyName.txt
```

### 2. Initialize profile in 0G

```bash
# Requires .env with 0G credentials (see SETUP.md)
pnpm profile:init
```

Encrypts your profile → uploads to 0G Storage → prints root hash.

### 3. Start the twin

```bash
pnpm twin
```

Output:
```
[apply-twin] MCP server :9013
[apply-twin] Add to MCP config: { "apply": { "url": "http://127.0.0.1:9013" } }
```

### 4. Connect to Claude Desktop

Edit `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apply": { "url": "http://127.0.0.1:9013" }
  }
}
```

Restart Claude.

### 5. Use it

In Claude Desktop:

```
Draft a cover letter for Anthropic, Senior Engineer role.

[Paste full job description here]
```

Claude will call your apply twin:
- Load your profile + style guide
- Analyze the role
- Generate a tailored letter (via 0G Compute)
- Save to your pipeline tracker

**Other queries:**
```
"Research Anthropic for AI infrastructure engineer roles"
"Track my application: Anthropic, Senior Engineer, sent"
"Show me my application pipeline"
"Update my skills: add Rust, Solidity"
```

## What You Provide

Create these 3 files in the package root:

### `style-guide.md`
Your writing rules: voice, tone, phrases to avoid, signoff style.

**See:** `style-guide.template.md` for template.

Example topics:
- Clichés you refuse (e.g., "passionate about innovation")
- Paragraph length + structure
- How formal/casual you write
- Your preferred signoff

### `profile-context.md`
Your background + positioning: experience, skills, target roles, gaps, culture fit.

**See:** `profile-context.template.md` for template.

Example topics:
- 2–3 key roles/projects with measurable results
- Technical + soft skills
- 2–3 target role types
- Honest gaps + learning velocity
- What environment energizes you

### `training-letters/` (optional)
Past cover letters you're proud of, named by company.

```
training-letters/
  Anthropic.txt
  0g.txt
  Figma.txt
```

Each file is one full letter (300–400 words). Used as style examples for the generator.

**See:** `training-letters/Example.txt` for template.

## What Gets Created Automatically

### `applications/tracker.json`
Your application pipeline. Auto-created on first run.

```json
{
  "applications": [
    {
      "id": "abc123",
      "company": "Anthropic",
      "role": "Senior Engineer",
      "status": "sent",
      "appliedAt": "2026-05-02T15:30:00Z",
      "fitScore": 8,
      "notes": "Strong match on inference + systems"
    }
  ]
}
```

Updated each time you track an application.

## Tools (via MCP)

### `draft_cover_letter`
Generate a tailored cover letter.

**Inputs:**
- `company`: Company name
- `role`: Job title
- `jd`: Full job description (paste text, no parsing needed)

**Output:** Tailored letter respecting your style guide.

**Under the hood:**
1. Load your profile + style guide
2. Analyze the role (extract proof points, gaps, company signals)
3. Call 0G Compute to generate letter
4. Check for clichés and guide violations
5. Return + save to pipeline

### `research_company`
Research company culture + strategic direction.

**Input:** `company` name

**Output:** Insights on company direction, team, problems they solve.

**Usage:**
```
"Research Anthropic's recent moves in inference + safety"
```

### `track_application`
Log an application in your pipeline.

**Inputs:**
- `company`: Company name
- `role`: Job title
- `status`: "lead" | "ready" | "sent" | "rejected" | "interview" | "offer"
- `notes` (optional): Any notes

**Output:** Application added to tracker.

**Usage:**
```
"Track: Anthropic, Senior Engineer, sent, Strong technical match"
```

### `get_pipeline`
Return your full application pipeline.

**Output:** All tracked applications (status, company, role, fit score, etc.)

**Usage:**
```
"Show my applications"
```

### `update_profile`
Update your profile (without editing the file).

**Inputs:**
- `field`: "summary" | "experience" | "skills" | "targetRoles" | "culture"
- `value`: New value

**Output:** Profile updated in 0G KV.

**Usage:**
```
"Add Rust to my skills"
"Update my target roles to focus on AI infra"
```

## Architecture

```
You (Claude Desktop)
    ↓ (natural language query)
Claude MCP Client :9013
    ↓ (JSON-RPC 2.0)
Apply Twin Runtime
    ├─ Load profile-context.md, style-guide.md (local disk)
    ├─ Load encrypted brain from 0G Storage (AES-256 decryption)
    ├─ Load/update memory from 0G KV (applications, profile state)
    ├─ Execute tool (draft_cover_letter, research_company, etc.)
    └─ Persist state back to 0G KV
    ↓ (calls tool, gets result)
0G Compute (TeeML, Qwen LLM)
    ↓ (verifiedReason() call)
Returns inference result → MCP → Claude
```

**Key invariants:**
1. All inference via 0G Compute (not Claude, not OpenAI)
2. Brain encrypted with AES-256 before upload to 0G
3. Profile files stay local (not uploaded)
4. Memory persists in 0G KV across sessions + devices

## Configuration

### Environment Variables

Required:
```env
# 0G network (testnet Galileo)
ZERO_G_PRIVATE_KEY=0x...
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ZERO_G_KV_NODE_URL=<from 0G docs>
ZEROG_BROKER_URL=<from 0G docs>
```

Optional:
```env
# MCP server port
APPLY_MCP_PORT=9013

# ENS identity (for agent discovery, not needed for single agent)
APPLY_ENS_NAME=apply.cortex.eth

# AXL (for agent-to-agent queries, not needed for single agent)
AXL_API_URL=http://127.0.0.1:9012
AXL_MCP_URL=http://127.0.0.1:9003
```

See full setup guide: [SETUP.md](./SETUP.md)

## File Structure

```
packages/apply/
├── README.md                    ← This file
├── SETUP.md                     ← Setup + troubleshooting guide
├── style-guide.template.md      ← Template (copy to style-guide.md)
├── profile-context.template.md  ← Template (copy to profile-context.md)
├── training-letters/
│   └── Example.txt              ← Template letter
│
├── style-guide.md               ← YOUR writing rules (gitignored)
├── profile-context.md           ← YOUR background (gitignored)
├── training-letters/*.txt       ← YOUR past letters (gitignored)
│
├── applications/
│   └── tracker.json             ← YOUR pipeline (auto-created, gitignored)
│
├── src/
│   ├── runtime.ts               ← MCP server + AXL listener
│   ├── tools.ts                 ← Tool implementations
│   ├── profile.ts               ← Load + summarize profile
│   ├── types.ts                 ← Type definitions
│   ├── cli.ts                   ← CLI (setup, init, etc.)
│   └── agents/
│       ├── writer.ts            ← Draft cover letter
│       ├── analyzer.ts          ← Analyze role + gaps
│       ├── researcher.ts        ← Research company
│       ├── checker.ts           ← Check draft quality
│       └── output.ts            ← Format output
└── package.json
```

## Workflows

### Workflow 1: Draft a Single Letter

1. In Claude: "Draft letter for [Company], [Role]" + [paste JD]
2. Twin loads your profile, analyzes role
3. 0G Compute generates letter
4. Twin checks for clichés + guideline violations
5. Claude shows you the draft
6. You refine or approve
7. Claude: "Track this application: sent"
8. Twin saves to pipeline

### Workflow 2: Batch Drafting

1. Gather 5–10 job descriptions
2. In Claude: Draft each one in parallel
3. Review all drafts
4. Send approved ones
5. Track all 5–10 in one "Track" command

### Workflow 3: Update Profile + Redraft

1. "Update my profile: add Rust to skills"
2. Twin updates in 0G KV
3. "Redraft the Anthropic letter" (now with Rust mentioned)
4. Twin reloads updated profile → new draft with Rust referenced

### Workflow 4: Persistent Across Devices

1. Draft letters on laptop
2. Next day on iPad: "Show my pipeline"
3. Twin loads from 0G KV → see all applications
4. Continue tracking

## Customization

### Change Your Style

Edit `style-guide.md`:
```markdown
- Avoid: "leverage", "synergy", ...
- Prefer: "shipped", "measurable", ...
```

### Change Your Positioning

Edit `profile-context.md`:
- Update experience if you shipped something new
- Adjust target roles if priorities change
- Reframe gaps if you've learned something

### Add Training Letters

Paste past cover letters into `training-letters/`:
```
training-letters/
  Stripe.txt      ← Full letter you sent to Stripe
  Figma.txt       ← Full letter you sent to Figma
```

Each informs the generator's style.

### Change Cover Letter Template

Edit `src/agents/writer.ts` → `writeFallbackDraft()` function to change the fallback template structure.

## Troubleshooting

**"Port 9013 already in use"**
```bash
lsof -ti:9013 | xargs kill -9
# Or use different port:
APPLY_MCP_PORT=9014 pnpm twin
```

**"Could not locate bindings file" (better-sqlite3)**
```bash
pnpm install --force
```

**Profile not loading**
Check file names (must be exact):
- `style-guide.md`
- `profile-context.md`
- Folder exists: `training-letters/`
- File exists: `applications/tracker.json`

**"ZERO_G_PRIVATE_KEY not set"**
```bash
# Get testnet funds: https://faucet.0g.ai
# Add to .env in repo root:
ZERO_G_PRIVATE_KEY=0x...
```

**Letter is generic / doesn't sound like me**
- Check `style-guide.md` — add more specific writing rules
- Add 2–3 past cover letters to `training-letters/`
- Update `profile-context.md` with more proof points

Full troubleshooting: [SETUP.md](./SETUP.md#troubleshooting)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  Claude Desktop (User)                  │
│  "Draft letter for Anthropic, Senior Engineer role"    │
└────────────────────────┬────────────────────────────────┘
                         │
                    JSON-RPC 2.0
                         │
        ┌────────────────▼─────────────────┐
        │   Apply Twin MCP Server :9013    │
        │  runtime.ts: handleToolCall()    │
        └────────────────┬─────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    │                    │                    │
 [Local]            [0G Storage]         [0G Compute]
    │                    │                    │
  ┌─▼──────────────┐  ┌─▼─────────────────┐ ┌┴──────────────┐
  │ style-guide.md │  │ Encrypted Brain   │ │ TeeML (Qwen)  │
  │ profile.md     │  │ (AES-256)         │ │ verifiedReason│
  │ training/*     │  │ Load/Update KV    │ │               │
  │ tracker.json   │  │ Append events     │ │               │
  └────────────────┘  └───────────────────┘ └───────────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Returned Letter    │
                    │ + Status Code      │
                    └────────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Claude Displays   │
                    │  "Draft complete"  │
                    └────────────────────┘
```

## Contributing

All paths relative to `packages/apply/`:

- **Add a new tool:** `src/tools.ts` + register in `src/runtime.ts`
- **Change draft logic:** `src/agents/writer.ts`
- **Change analysis:** `src/agents/analyzer.ts`
- **Change quality checks:** `src/agents/checker.ts`
- **Change profile loading:** `src/profile.ts`

## License

MIT

## Support

- Setup issues? → [SETUP.md](./SETUP.md#troubleshooting)
- Feature requests? → GitHub issues
- Questions? → See examples in `demo/04-focus-session.ts`
