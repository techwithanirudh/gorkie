# gorkie TODO

Source of truth for outstanding work. Grouped by area. Tick when done, then prune.
See [DESIGN.md](./DESIGN.md) for architecture.

## Recently completed (prune after review)

- [x] `maxSteps` raised 5 → 150 (`defaultOptions.maxSteps`).
- [x] Tool outputs shown: `toolDisplay` `'grouped'` → `'timeline'`.
- [x] Tool name fix (`tools: { get_weather }`); verified tool calling + caching works.
- [x] Removed timestamp + speaker from the system prompt (cache-killers).
- [x] Sandbox guidance → `E2BSandbox.instructions`; prompts split one-file-each; types in `src/mastra/types/`.
- [x] **Tools Batch 1a (read):** `read_conversation_history`, `get_user`, `get_channel_info`, `list_threads` — live.
- [x] **Tools Batch 1b (files):** `get_file`, `upload_file` — live (resolve per-thread E2B sandbox, `sandbox.e2b.files` read/write, Slack download/upload).
- [x] Few-shot **examples** prompt block added (static → cache-safe).
- [x] **FIXED: sandbox reset between tool calls** — `sandboxCacheKey` was returning null (`MASTRA_THREAD_ID_KEY` isn't set at resolve time), so the workspace fell back to a per-RequestContext WeakMap and span up a NEW E2B sandbox every call (files/installs vanished). Now keyed on `channel.threadId` (which channels reliably sets) → one persistent sandbox per thread.
- [x] **Sandbox lifecycle (cost)** — `sandboxLifecycle` output processor: bump timeout to 5 min only on steps that call a sandbox tool (`processOutputStep` + `toolCalls`), and **pause the sandbox at turn end** (`processOutputResult` → `e2b.pause()`) so we stop paying for idle compute immediately. Creation timeout 5 min as the fallback.
- [x] **Tools Batch 3a:** `search_web` (Exa) — live.
- [x] Examples prompt expanded with a "what can you do" capabilities answer + file/search/chart flows.
- [x] **Tools Batch 2 (act):** `post_message`, `schedule_reminder`, `leave_thread` — live (via `getBot()` Chat accessor).
- [x] Removed `get_weather`.

## Open questions (need your call — don't want to assume)

- [x] `maxSteps` → 150 (your call).
- [x] Keep `MastraStorageExporter`; plan to route observability to **DuckDB via composite storage** for local (DuckDB supports the observability domain, so the logs/metrics warnings go away with no batching change). Implement after tools.
- [x] **Sandbox `timeout`** → 90s (was 5-min default). Pauses sooner to save credits; slight resume latency on the next message.
- [ ] **Shared-thread `resourceId`** — keep per-first-speaker (fine for thread-scoped memory) or key on the channel/thread? Only matters if we move OM to resource scope or add per-user App Home data.
- [ ] **`resourceId` for shared threads** — channels defaults to the first speaker's `slack:<userId>`. Key on the channel/thread instead (so memory belongs to the conversation, not one person)? Ties to OM scope (thread vs resource).
- [ ] **Observability store** — keep PG (warnings, Studio discovery unsupported), or route the observability domain to ClickHouse/DuckDB via composite storage? Only matters at higher volume.

## Testing (E2E — mostly needs you in Slack/Studio; I'll prep what I can)

- [ ] Tool calling in **Agent UI (Studio)** and **Slack** (programmatic test already passes).
- [ ] Tool task UI: confirm `timeline` now shows tool outputs nicely; refine if cramped.
- [ ] **DM** conversation (gorkie replies to every message).
- [ ] **@mention in a new thread** → follows the whole thread.
- [ ] **@mention mid-thread** → answers once; pinging again re-fetches the last ~10 messages. Verify it picks up what was said in between.
- [ ] **Observational Memory + compaction** — long thread, confirm older history compresses and recall still works.
- [ ] **Sandbox stability** — can it build/serve a website; does the sandbox stay alive across turns or keep dying.
- [ ] **Attachments**: upload an image and ask gorkie to describe it; upload a PDF (should land in the sandbox); `generate_image` editing that infers an image from context.
- [ ] **Stop** — once implemented, test it actually aborts a run.
- [ ] **Message steering** — send a follow-up mid-run; check whether the run picks it up. If not handled, handle it.

## Tools (port from old codebase, as Mastra `createTool`s in `src/mastra/tools/`)

- [x] **Batch 1a — core Slack read:** `read_conversation_history`, `get_user`, `get_channel_info`, `list_threads` — live.
- [x] **Batch 1b — files:** `get_file`, `upload_file` — live.
- [x] **Batch 2 — Slack act:** `post_message`, `schedule_reminder`, `leave_thread` — live.
- [x] **Batch 3a:** `search_web` (Exa) — live.
- [ ] **Batch 3b — `search_slack`** (deferred): needs the per-message Slack `action_token` from `message.raw` (for `assistant.search.context`). Mastra tools only get `requestContext`, not the raw message — so we'd have to plumb the action token through (e.g. channels handler → requestContext). Revisit.
- [ ] **Batch 4 — generative:** `generate_image`, `mermaid` (render + upload to the thread).

## Prompts

- [x] Few-shot **conversation examples** added to the *system prompt* (`prompts/examples.ts`) — anchors tone/capabilities. NOTE: this is separate from the App Home suggested prompts the user wants (below).
- [ ] **App Home / Assistant suggested prompts** — the clickable conversation starters shown when you open the assistant ("what reference did"). Wire `channels.sdk.onAssistantThreadStarted` → `slack.setSuggestedPrompts(channelId, threadTs, [...])`. Part of the App Home phase.
- [ ] Re-review old codebase prompts to confirm nothing important is missing (presets/personas, hints).
- [ ] **User custom instructions** — inject the speaker's saved preset as `<user_instructions>` in the user message (not the system prompt, to keep caching). Core prompt already references it.

## Features (phased)

- [ ] **Stop button (queued next, before more tool batches)** — `sdk.onAction('stop_turn')` → `agent.abortThreadStream()`; post a Block Kit card with a Stop button during a run. Verify the abort actually stops the run.
- [ ] **Steering** — check whether channels handles mid-run follow-ups internally (`agent.sendMessage` delivers into an active run). Test; only build something if it doesn't work natively.
- [ ] **App Home** — `sdk.onAppHomeOpened()`; persona presets + per-user custom instructions store.
- [ ] **Allowlist / onboarding** — opt-in gating (old `isUserAllowed` + opt-in flow).

## Research

- [x] **Sandbox lifecycle & cost** — `timeout` is the sandbox **max lifetime** (set at creation, `onTimeout: 'pause'`), NOT a per-command timeout and NOT auto-refreshed on activity (Mastra's `connectionOpts` has no `timeoutMs`, and the command path never calls `setTimeout`). So a turn/command running past the lifetime risks the sandbox pausing under it. Set to 3 min.
- [x] **Refresh sandbox timeout during long turns** — done via the `keepSandboxWarm` per-step processor. (Still verify E2B's exact per-second pricing + resume behavior.)
- [ ] **Custom E2B template** — heavy one-shot installs (Playwright/Chromium ~300MB) can exceed the idle window in a single command. Now that the sandbox persists, the agent can install once and reuse, but the cleaner fix is a pre-built E2B template (`template` option) with chromium/playwright/ffmpeg baked in. Investigate.
- [ ] **Sandbox egress** — the agent reported `transfer.sh` uploads not returning a URL from inside the sandbox. Check E2B outbound network / whether we need it; the persistent sandbox + `upload_file` should cover most "share a file" needs without external hosting.
- [ ] **Re-test screenshots/Playwright** now that the sandbox persists across tool calls.
- [ ] **Harness vs plain Agent** — the Mastra Harness wraps the Agent and adds interruption/threading handling. Evaluate whether we need it; if only parts, dig into the harness source and pull just those into our agent.
- [ ] **Channels escape hatch** — if channels' all-in-one handling (streaming, tool display, attachments, task handling, context fetch, multi-user) ever limits us, evaluate copying those pieces and owning them ourselves.
- [ ] **Composite storage (DuckDB for observability)** — implement after tools to silence the logs/metrics warnings without changing batching.

## Ops

- [ ] Local Postgres is a manual dev cluster on :5434. For prod, point `DATABASE_URL` at managed Postgres (Supabase/Neon) that survives restarts.
- [ ] Note: `bun run dev` (Studio) writes a local LibSQL `mastra.db` — a Studio artifact, not the bot's Postgres. Gitignored.
