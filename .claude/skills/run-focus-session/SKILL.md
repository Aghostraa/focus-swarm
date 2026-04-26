---
name: run-focus-session
description: Orchestrate a full synthetic focus group session. Smith N personas, spawn AXL cohort, run moderator turns, write synthesizer report. Use when user says "run focus session", "test product with synthetic users", "start a study".
---

# run-focus-session

End-to-end session: market spec → persona cohort → moderated dialogue → report.

## Inputs
- `targetMarket` — natural language brief
- `productSpec` — URL or pasted description of product under test
- `n` — cohort size (default 4)
- `turns` — total turns to run (default 20)

## Steps
1. **Smith N personas** — call `mint-persona` skill N times with diverse archetypes (sample from archetype library or have Compute propose archetypes for the target market).
2. **Boot AXL cohort** — call `spawn-axl-cohort` skill with N+2 nodes (N personas + 1 moderator + 1 harness).
3. **Bind personas to nodes** — assign each persona's ed25519 key to the corresponding AXL node config; restart that node so peer-id matches `agent.axl_peer` ENS record.
4. **Inject product** — moderator and harness fetch productSpec. Harness captions screenshot via 0G Compute vision (or text fallback) and broadcasts as `observation` over A2A.
5. **Turn loop** (run `turns` times):
   - Moderator picks next speaker (round-robin or weighted by recent silence).
   - Moderator sends `POST /a2a/{speaker_peer}` with `SendMessage{prompt, recent_transcript}`.
   - Speaker persona runtime:
     - Read its KV state from 0G (`mood`, `current_opinion_vector`).
     - RAG over its 0G Log (life-story chunks + prior session memory).
     - Call 0G Compute Qwen, verify response.
     - Append utterance to its 0G Log; update KV state.
     - Broadcast utterance to all peers via A2A.
   - Other personas update KV mood vector based on heard utterance (cheap inference or rule-based).
6. **Synthesize** — synthesizer reads full log (all personas' Log streams), runs clustering + contradiction extraction via 0G Compute, writes report blob to 0G Storage, updates ENS text record `agent.last_session = 0g://<reportHash>` on each persona.
7. **Return** session manifest: `{ cohort: [...ensNames], reportHash, txHashes }`.

## Files
- `packages/moderator/src/index.ts` — turn driver
- `packages/persona/src/runtime.ts` — speaker logic
- `packages/synthesizer/src/index.ts` — report writer

## Throughput notes
- 0G Compute rate limit: 30 req/min, 5 concurrent per account. With N=4 personas, 1 reply per turn ≈ within budget. For N>6, stagger turns or rotate broker accounts.
- AXL message size cap default 16 MB — utterance + transcript well under.

## Don't
- Skip TeeML verification on any inference call.
- Use a centralized message queue (Redis/NATS) instead of AXL — breaks Gensyn track invariant.
