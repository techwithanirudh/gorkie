# gorkie TODO

Source of truth for outstanding work. Grouped by area. Tick when done, then prune.
See [DESIGN.md](./DESIGN.md) for architecture.

## Recently completed (prune after review)

- [x] **Exact Mastra channels source review:** copied the upstream Mastra channels implementation into a local review folder with commit provenance, then produced a real size/diff/visual review artifact showing what owning it would add.
- [x] **FLIPPED BACK to Mastra `AgentChannels`** (least code + stable internals). Researched: Mastra exports nothing reusable except `MastraStateAdapter`/`defaultTypingStatus`, but **handler overrides** (`onMention`/`onSubscribedMessage`/`onDirectMessage` calling `defaultHandler`) let us own subscription policy while reusing all of `processChatMessage`'s stable internals (message build, multi-user attributes, history fetch, `sendMessage`+native steering, subscription mechanics). Config: `channels.adapters.slack { toolDisplay: 'timeline' }` (shows output, zero render code), `threadContext.maxMessages: 10`, `handlers: { onMention, onSubscribedMessage, onDirectMessage }`. **Deleted** the owned pipeline (`run-turn`/`prompt`/`render`), the `getBot`/`setBot` ref, and the `resolveToolDisplay` hijack. Clean `chat()` accessor (`chat/instance.ts`) = `gorkieAgent.getChannels().sdk`. **Stop button** ported 1:1 from reference (`chat/controls.ts` Card/Actions/Button posted per-turn in handler overrides + `chat/stop.ts` `onAction('stop_turn')` → `abortThreadStream` via `listThreads(metadata.channel_externalThreadId)` lookup). Traded away: reasoning-as-task + per-tool inline status (channels can't; revisit if Mastra ships render hook — issue #15856). Native steering + stable subscription/multi-user now come free.
- [x] **MIGRATED OFF Mastra `AgentChannels` → own the Chat SDK directly** (Level 2). We hit the channels ceiling (grouped+output needed a `resolveToolDisplay` monkey-patch; no access to the Chat instance; couldn't do inline tool status). Now: `channels/client.ts` builds `new Chat({ adapters:{slack}, state: new MastraStateAdapter(memoryStore) })`; `handlers.ts` registers `onNewMention`/`onSubscribedMessage`/`onDirectMessage`/`onAction(stop_turn)` → `run-turn.ts`; `run-turn.ts` sets `requestContext.channel` (keeps sandbox caching), calls `gorkieAgent.stream()`, posts `new StreamingPlan(renderStream(fullStream), { groupTasks:'plan' })`; `render.ts` consumes the agent `fullStream` (text-delta/tool-call/tool-result/tool-error) → task chunks with our per-tool renderers; `prompt.ts` does multi-user labels + thread-history backfill. Deleted `grouped-output.ts` (hijack), `tool-display.ts` (folded into `render.ts`), `examples.ts`. Reuse: `MastraStateAdapter` (subscriptions persist), agent (model/tools/memory/workspace), `events.ts` (App Home). Unlocks: grouped+output natively, inline tool status, Stop/steering hooks (`stopTurn` + per-thread AbortController already wired).
- [x] `maxSteps` raised 5 → 150 (`defaultOptions.maxSteps`).
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
- [x] **Grouped UI matches old gorkie** — grouped plan renders command/tool output (the fence format was the bug; Slack plan-mode `output` wants a plain string, not a ```` ``` ```` block). Per-tool renderers (`channels/tool-display.ts`) now mirror the reference: present→past title flip (`Running command`→`Ran command`), `request→details` input line, `response→output`. Slack merges task fields by `task_id` so details persist beside output.
- [ ] **Per-tool output summaries** (deferred, user's call) — old gorkie shows concise summaries (`Found 10 Slack results`, `Found twa (he/him/his)`) instead of raw output. Port the reference `stream/tasks/*` response renderers when we want that polish. Raw output is fine for now.
- [ ] **Reasoning "Thinking" tasks** — old gorkie surfaces model reasoning as a `Thinking` task with the reasoning text. Needs the model to emit reasoning chunks + handling them (they don't come through the `ToolDisplayFn`, which only sees tool events).
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

## Data / persistence

- [ ] **Port the reference codebase's drizzle setup** (`gorkie-slack/apps/*`) — drizzle schema + migrations + client, so we have first-class tables for **user custom instructions / presets**, allowlist/onboarding, and any per-user App Home state. Mastra's `PostgresStore` owns its own memory/observability tables; this drizzle layer is *our* app data alongside it, on the **same** shared Supabase Postgres (`DATABASE_URL`). Decide: reuse the reference's existing tables on this shared DB, or namespace gorkie's own. Blocks: custom instructions, App Home presets, allowlist.

## Integrations (wanted)

- [ ] **agent-browser skill** — add the agent-browser skill so gorkie can drive a browser.
- [ ] **agentmail** — integrate agentmail (email send/receive for gorkie).

## Features (phased)

- [ ] **Tool display — back to `timeline` + custom tool render** — `grouped` loses fidelity; revisit switching `toolDisplay` back to `'timeline'` and adding a custom tool render (an `onToolCall`-style formatter like old/v1 gorkie). We can't drive a streaming plan with correct per-tool data, but timeline + a custom render keeps the rendered data correct. Investigate the channels hook that lets us format each tool call.
- [ ] **`[Thread context]` mention encoding** — Mastra's auto-injected thread-context block HTML-escapes mentions (`&lt;@U…&gt;`) so the model reads escaped junk (our own `read_conversation_history` output is clean). Decide: disable `threadContext` (`maxMessages: 0`) and rely on the tool, override the block, or report upstream.
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
- [ ] **Test attachment handling end-to-end** — upload an image, confirm gorkie (a) sees it (vision via channels), (b) can read/modify it from the seeded sandbox path (`copySlackFilesIntoSandbox`), and (c) `get_file` works for files behind a **Slack canvas** (not just plain uploads).
- [ ] **Sandbox-lifecycle bump — align with reference?** Reference bumps the sandbox timeout **before every command** (`extendTimeout` → `setTimeout(~21min)` right before `commands.run`), so long commands are protected. We bump in `processOutputStep` **after** the step, to only **5 min** — a single `execute_command` running >5 min could pause mid-run. Consider bumping pre-step and/or raising `SANDBOX_MS` to match the command timeout.
- [ ] **Harness vs plain Agent** — the Mastra Harness wraps the Agent and adds interruption/threading handling. Evaluate whether we need it; if only parts, dig into the harness source and pull just those into our agent.
- [ ] **Channels escape hatch** — if channels' all-in-one handling (streaming, tool display, attachments, task handling, context fetch, multi-user) ever limits us, evaluate copying those pieces and owning them ourselves.
- [ ] **Composite storage (DuckDB for observability)** — implement after tools to silence the logs/metrics warnings without changing batching.

## Ops

- [x] `DATABASE_URL` now points at the **shared Supabase Postgres** (same instance as the reference bot, `gorkie-slack/apps/bot/.env`) instead of the local :5434 cluster — survives restarts, shared with the drizzle app data above. Note: it's the **transaction pooler** (`:6543`), so drizzle migrations/`db:push` may need the session/direct URL (`:5432`) instead.
- [ ] Note: `bun run dev` (Studio) writes a local LibSQL `mastra.db` — a Studio artifact, not the bot's Postgres. Gitignored.
