# gorkie TODO

Running list of open work and decisions. See [DESIGN.md](./DESIGN.md) for architecture.

## Decisions to make

- [ ] **Memory ownership (`resourceId`) — global vs per-thread.** Channels defaults `resourceId` to the first speaker's `slack:<userId>`, so a shared thread's memory is "owned" by whoever spoke first. The multi-user-threads guide recommends keying `resourceId` on the *conversation* (e.g. channel/thread) for shared threads. Decide and, if needed, set channels `resolveResourceId`. Tied to: should OM be thread-local (current) or per-user across threads (`scope: 'resource'`, experimental)?
- [ ] **Composite storage — do we need it?** No, not currently. `MastraCompositeStore` routes different domains (memory / workflows / observability) to different DBs. We use one Postgres for everything, which is simpler and fine. Revisit only if observability traces get heavy — then offload the `observability` domain to a columnar store (DuckDB) and keep memory on Postgres. Tracking as optional.
- [ ] **Current time in prompt.** Removed from the system prompt (it changed every turn and broke the conversation cache). If the agent needs "now", it can run `date` in the sandbox, or we inject time into the latest user message (uncached tail) — not the system prefix. Decide if we want the latter.
- [ ] **Channel *name*.** `requestContext.get('channel')` exposes channel *id*, not name. If the model needs names for nicer replies, add a `get_channel_info` tool (batch 1) rather than putting it in the prompt.

## Prompt caching (budget: ~$6/day inference)

- [x] Keep the system-prompt prefix static: identity blocks (`core`/`personality`/`slack`) are byte-identical across all threads → cached globally; thread-stable context (channel/thread id) comes after.
- [x] No timestamp / no speaker in the system prompt (speaker rides in the message body via channels).
- [x] Sandbox guidance moved to `E2BSandbox.instructions` (static) instead of a per-request block.
- [ ] Watch `usage.prompt_tokens_details.cached_tokens` in Langfuse to confirm follow-ups hit the cache.
- [ ] Consider lowering `lastMessages` (currently 20) — OM compresses older history, so the verbatim window can likely be smaller.

## Features (phased)

- [ ] **Stop button** — `sdk.onAction('stop_turn')` → `agent.abortThreadStream()`. Wiring known (DESIGN.md); needs the Block Kit card posted during a run.
- [ ] **App Home** — `sdk.onAppHomeOpened()`; persona presets + per-user custom instructions store.
- [ ] **User custom instructions** — inject the speaker's saved preset as `<user_instructions>` in the user message (not the system prompt, to preserve caching). Core prompt already references it.
- [ ] **Allowlist / onboarding** — opt-in gating (old codebase had `isUserAllowed` + opt-in flow).

## Tools (port from old codebase, in batches)

Each as a Mastra `createTool` in `src/mastra/tools/`. Tools read ids from `requestContext` and use the shared `slack` adapter / its `WebClient` for Slack calls.

- [ ] **Batch 1 — core Slack context (read):** `read_conversation_history`, `get_user`, `get_channel_info`, `list_threads`.
- [ ] **Batch 2 — Slack act:** `post_message` (to another thread/channel), `schedule_reminder`, `leave_thread` (stop following the current thread). Reactions already exist via channels (`add_reaction`/`remove_reaction`).
- [ ] **Batch 3 — external:** `search_web` (Exa, needs `EXA_API_KEY`), `search_slack`, `get_file` (download a Slack file into the sandbox).
- [ ] **Batch 4 — generative:** `generate_image`, `mermaid` (render + upload to the thread).

## Ops

- [ ] Local Postgres is a manual cluster on :5434 (dev only). For prod, point `DATABASE_URL` at a managed Postgres (Supabase/Neon) — it must survive restarts.
- [ ] `bun run dev` (Mastra Studio) writes a local `src/mastra/public/mastra.db` (LibSQL) — a Studio artifact, unrelated to the bot's Postgres. Gitignored; don't confuse it for app storage.
