# gorkie TODO

Source of truth for outstanding work. Grouped by area. See [DESIGN.md](./DESIGN.md) for architecture.

## Priority queue

- [ ] **P0: Delegate task title/heartbeat UI**: fix `delegate_task` so the Slack tool card is not born as `Delegate Task`, heartbeat/progress updates are visible while long delegates run, and cancellation ends as cancelled rather than a misleading finished `Starting Task`.
- [ ] **P0: AgentMail in dev**: fix AgentMail/email sending in `gorkie (dev)`.
- [ ] **P0: Subagent stability**: investigate why subagents are still broken in Slack, including interruption behavior vs original turns.
- [ ] **P0: Port recurring scheduled tasks with Mastra heartbeats**: expose one AI tool, `scheduled_task`, backed by `mastra.heartbeats` for create, list, pause, resume, and delete/cancel. Drop the old App Home task UI and custom `scheduled_tasks` runner/table. Default every task to run where it was scheduled: current Slack thread, DM, or channel from `channelContext`, with explicit override only when the user asks. Use heartbeat `threadId`/`resourceId` for threaded runs, persist instead of barging in when the target thread is active, and wake when idle with the original Slack request context.
- [ ] **P0: GLM image input crash**: uploaded images can crash GLM/non-vision models. Detect model image support before Mastra sends image parts, and degrade to file/path text for models that do not support images.
- [ ] **P0: Provider/log redaction**: upstream model errors can persist full provider response bodies, provider key-management URLs, and giant HTML error pages in observability/logs. Sanitize `APICallError` bodies before logging and storage export.
- [ ] **P0: `get_file` complexity follow-up**: keep the simple `.part`/`.next`/`.merge` resumable download path for now. Only revisit chunk libraries or numbered-part flows after real Slack E2E failures, because the downloader experiments made the tool too complicated.
- [ ] **P0: Sandbox image file viewing bug**: viewing images from files in the sandbox is currently bugged. `read_file` media is disabled because Mastra sends base64 tool results through a broken media path; fix upstream or add a safe replacement before re-enabling. [might be related to opencode go and might wrk fine with all other providers]
- [ ] **P0: Skills**: add more workspace skills now that current skill discovery/tool exposure is working.
- [ ] **P1: Signals and email monitor**: add event triggers such as "email arrived, spawn an agent", process/respond automatically only when appropriate, and wire an email monitor.
- [ ] **P1: GitHub repo troubleshooting workflow**: add GitHub account access, repo cloning, code inspection, and troubleshooting flows for user repos.
- [ ] **Later: Tool display preference**: let users choose hidden vs original/visible tool display mode.
- [ ] **Later: `upload_file` target support**: add upload support for thread/channel/DM targets similar to `post_message`.
- [ ] **Later: Subagent availability prompt**: make Gorkie know which helper agents exist and which tasks each one should handle.

## Open questions (need your call)

- [ ] **`resourceId` for shared threads**: channels defaults to the first speaker's `slack:<userId>`. Key on the channel/thread instead (so memory belongs to the conversation, not one person)? Ties to OM scope (thread vs resource).

## Recently completed

- Styled the completion footer as italic Slack mrkdwn and confirmed the current footer path has no steering-detection state. It posts from Mastra's final `processOutputResult` hook only after a run resolves.
- Killed all active `mastra dev` / `.mastra/output` runtime processes for this checkout, then verified port `4111` and `observability.duckdb` have no open listeners or locks.
- Refactored `delegate_task` cancellation/display: abort now stops the heartbeat loop and marks the parent task as cancelled, child stream abort chunks stop the delegate loop, and the parent Slack card title stays `Starting Task: ...` through completion.
- Confirmed scheduled tasks are created with the current channel `threadId` plus agent `resourceId`, so runs wake or persist back into the same Slack context where the task was scheduled. Access currently allows the same resource or same thread.
- Audited the Mastra dev/HMR path. The running dev server hot-reloaded successfully, but a second dev/start process fails because the existing dev child owns port `4111` and the DuckDB write lock.
- Removed the temporary steering tracker from Slack handlers. The completion footer now posts from the Mastra result hook without steering detection.
- Restored the last committed delegate-task display behavior for the Slack "Starting Agent" card.
- Restored the older ranged `.part`/`.next`/`.merge` `get_file` downloader because Slack files are often huge and interrupted retries should resume.
- Added the completion footer through Mastra's `processOutputResult` hook: non-steered Slack turns post `Gorkie may make mistakes. Double-check important information.`, and `skip` gets the footer for now.
- Scrapped the completion-divider experiment completely after Slack rejected divider-only messages with `no_text`.
- Removed the experimental turn-status reaction code and keep `skip` visually silent by hiding its tool row.
- Explained why steering can show a tick: Mastra's channel handler can return after delivering a new message into the active run, while `respond()` unconditionally marks that message `done` after `defaultHandler` returns.
- Updated `@mastra/e2b` to `0.5.0-alpha.0`, switched sandbox creation to direct `new E2BSandbox({ network, ... })`, renamed the sandbox helper functions to `createNetwork` and `createEnv`, and removed the `GorkieSandbox` post-start `updateNetwork` wrapper path.
- Wrote `CODING_STANDARDS.md` and did a standards-driven cleanup pass: replaced the `Sandbox.create` monkeypatch with `e2b.updateNetwork()` applied after start in `GorkieSandbox` (works until the `@mastra/e2b` network option ships), centralized the `as E2BSandbox` casts into `resolveE2BSandbox()`, removed the redundant toolCallId/toolName Maps and duplicated stream branches in `delegate_task`, deduped `label()` into `lib/label.ts`, deleted dead `successToolCall` and the unused `config` wrapper, folded the repeated heartbeats cast and task scoping into `scheduled-tasks/queries.ts`, and split `get_file`'s 170-line closure into named download functions.
- Checked the old reference scheduled-task implementation. It is a recurring automation system, not just one-shot reminders: `scheduleTask` creates cron jobs, `listScheduledTasks` and `cancelScheduledTask` manage them, App Home renders/cancels them, and a background `scheduledTaskAgent` runs each task and calls `sendScheduledMessage` exactly once.
- Refined the scheduled-task plan to be AI-facing only: create/list/pause/resume/delete, no App Home task UI, and default delivery to the Slack place where the task was scheduled.
- Confirmed Mastra PR [#18785](https://github.com/mastra-ai/mastra/pull/18785) was merged at `2026-07-02T10:06:03Z` as commit `cb7a7218`. NPM is still at `@mastra/e2b@0.4.1`, so local cleanup waits for release or explicit vendoring.
- Vendored the Mastra PR version of `@mastra/e2b` into Gorkie, temporarily simplified sandbox creation to direct `new E2BSandbox({ network, ... })`, and verified `bun run typecheck` passes. Updated the Mastra changeset and PR body with the E2B per-host request transform docs link.
- Opened Mastra PR [#18785](https://github.com/mastra-ai/mastra/pull/18785) adding a clean `network` option to `@mastra/e2b`, with an E2B unit test and focused package verification.
- Explained why sandbox network options are registered in a map before patching `Sandbox.create`.
- Fixed E2B brokered credential egress by applying AgentMail/GitHub `network.rules` at sandbox creation time through a small `NetworkedSandbox` wrapper.
- Fixed Python AgentMail certificate failures by passing `SSL_CERT_FILE=/usr/lib/ssl/cert.pem` through the command env. Smoke check returned `agentmail:ok`.
- Removed brokered bearer injection from `github.com` root. Smoke check confirmed public git over `github.com` works and `gh api` still authenticates as `gorkie-agent` through `api.github.com`.
- Updated `delegate_task` progress so the parent task card reads `Starting Research Agent: Calm Green`, heartbeats update the same card, and child tool calls update details such as `Running Search Slack`.
- Verified no Mastra or `.mastra` runtime processes are still running.
- Stopped the local `mastra dev` Gorkie runtime process group.
- Added host-side E2B network-rule credential brokering for AgentMail and GitHub without putting real tokens into sandbox environment variables.
- Added input token limiters to Research, Explore, and Execute so delegated loops get the same prompt-size guardrail as the main agent.
- Changed delegated child tool rows to render under agent prefixes such as `[Research] Search Slack`, and changed logs to `[agent] [research] ...`.
- Added unique delegated run names via `unique-names-generator` for concurrent Research, Explore, and Execute runs while keeping tool titles grouped by agent type.
- Researched cleaner E2B credential-injection paths in the installed Mastra/E2B APIs. `@mastra/e2b` does not expose a direct `network` option, so create-time `Sandbox.create` wrapping is needed for E2B transform rules.
- Removed Node AgentMail install/reference paths. AgentMail skill docs are now Python-only, and the template still keeps Node plus `gh`.

## Testing (E2E, needs you in Slack)

- [ ] **`delegate_task` Slack tool E2E**: verify child agent `tool-call` / `tool-result` chunks render as normal Slack tool rows with prefixed names such as `agent_research-fast-blue_search_slack`, and confirm child tool calls/results are logged.
- [ ] **`delegate_task` agent tool scoping E2E**: verify in Slack that Research/Explore/Execute only expose their intended `activeTools`, child tool display titles read like `Fast Blue: Search Slack`, and delegated tool logs include agent plus tool names.
- [ ] **Images without extensions**: fix `read_file` on downloaded images/binaries without file extensions so it detects MIME from bytes instead of dumping raw binary text.
- [ ] **DM** conversation (gorkie replies to every message).
- [ ] **Observational Memory + compaction**: long thread, confirm older history compresses and recall still works.
- [ ] **`get_file` timeout retest**: after the cleanup refactor, repeat the huge Slack zip forced-abort test and confirm `.part`/`.next` resume still completes with `unzip -t`.
- [ ] **Real Slack `get_file` retest**: test current `get_file` against an actual Slack file in E2B, including a previously paused/dead sandbox, and confirm completion is indicated clearly.
- [ ] **E2B start regression check**: verify whether `ensureRunning()` fails on paused/dead sandboxes where `start()` succeeds, especially for `get_file`, `upload_file`, and filesystem init.
- [ ] **Foreground `execute_command` stale sandbox recovery**: reproduce the post-turn paused-sandbox case where the first foreground command returns `Sandbox is probably not running anymore`, then confirm whether wrapping `executeCommand` itself in `retryOnDead` fixes the first command after a pause.
- [ ] **Slack search compact-output test**: after researching a compact `search_slack` model output shape, test repeated broad Slack searches in one turn and confirm the model sees concise hits plus cursors instead of giant context JSON.
- [ ] **Token limiter loop test**: after researching the Mastra `TokenLimiterProcessor` settings, run a tool-heavy multi-step turn and confirm per-step pruning prevents context overflow without deleting the active user request or latest tool result.
- [ ] **Observational memory token-limit test**: test whether an input token limiter interferes with observational memory, long-thread recall, or observation/reflection writes, especially when older messages are pruned from the live model prompt.
- [ ] **Tool-result media vision**: `read_file` workspace media is disabled because sandbox image/PDF tool results can send base64 through a bugged Mastra media path. Trace model/provider media support and Mastra tool-result conversion before re-enabling.
- [ ] **Mention input/output rendering**: confirm Slack mentions resolve properly in model-visible input, thread context, history/tool output, and final Slack replies.
- [ ] **Filesystem tools in Slack**: confirm `read_file`, `write_file`, `edit_file`, `list_files`, `grep`, `delete_file`, `file_stat`, and `mkdir` work through Slack and render cleanly.
- [ ] **Full tool robustness audit**: review all repo tools plus installed Mastra workspace tools for direct E2B access, stale sandbox recovery, path handling, and output/media behavior.
- [ ] **All tool smoke tests**: test every registered tool in Slack, including `mermaid` and `getUser`/user lookup behavior.
- [ ] **Tool caching parity**: validate caching behavior for all tools against the reference code.

## Tools

- [ ] **Generative tools**: `generate_image` (render + upload to the thread).
- [ ] **Custom voice support**: support user-selected/custom voices instead of only a default Google Assistant-style voice.
- [ ] **Slack voice message sending**: send generated voice messages directly back to Slack when approved.
- [ ] **Sandbox image-viewing layer**: add image viewing/tool support for models that cannot inspect images directly.
- [ ] **Reusable sandbox skill system**: explore `skills.sh` or similar systems, and prefer reusable preinstalled sandbox skills over ad hoc installs.
- [ ] **User MCPs**: allow users to connect their own MCP servers safely.
- [ ] **User-defined skills**: allow users to define skills with review, scope, and safety limits.
- [ ] **`search_slack` action-token lifetime investigation**: measure how long Slack `action_token`s remain valid, why they die between turns/tool calls, and whether token storage should be per-message, per-thread, refreshed from new mentions, or replaced by a user-token search path.
- [ ] **`search_slack` token plumbing cleanup**: the `captureSearchToken`/`getSearchToken` flow (grab the per-message Slack `action_token` from `message.raw` in the handlers, stash per-thread, read it back in the tool) is hacky. Find a cleaner way to plumb the action token to the tool.

## Prompts

- [ ] **App Home / Assistant suggested prompts**: `channels.sdk.onAssistantThreadStarted` → `slack.setSuggestedPrompts(...)`. Part of the App Home phase.
- [ ] **User custom instructions**: inject the speaker's saved preset as `<user_instructions>` in the user message (not the system prompt, to keep caching). Core prompt already references it.

## Data / persistence

- [ ] **Port the reference's drizzle setup** (`gorkie-slack/apps/*`): schema + migrations + client for **custom instructions / presets**, allowlist/onboarding, App Home state. Mastra's `PostgresStore` owns memory/observability tables; this is *our* app data on the same shared Supabase Postgres. Decide: reuse the reference's tables or namespace gorkie's. Blocks: custom instructions, App Home presets, allowlist. Note `:6543` is the pooler, migrations may need the `:5432` direct URL.

## Features

- [ ] **Add more skills**: expand available skills after current skill loading is fixed.
- [ ] **Self-learning and auto-skill creation**: explore whether Gorkie can create reusable skills from repeated work without becoming too specific, surprising, or invasive.
- [ ] **Multi-model support**: consider Gemini/GPT/Claude routing, gated by cost controls and explicit user choice.
- [ ] **Website creation and deployment workflows**: support creating, previewing, and deploying websites for users.
- [ ] **Tool display preference**: future lower-priority feature, let users choose hidden vs original/visible tool display mode.
- [ ] **Agent browser**: consider adding a proper agent browser integration instead of relying on ad hoc browser tooling.
- [ ] **Image-capable file reads**: fix sandbox file image viewing. Mastra's read-file media path is currently unsafe/bugged for our provider path.
- [ ] **`[Thread context]` mention encoding**: Mastra's auto-injected thread-context block HTML-escapes mentions (`&lt;@U…&gt;`) so the model reads escaped junk (our `read_conversation_history` output is clean). Decide: disable `threadContext` (`maxMessages: 0`) + rely on the tool, override the block, or report upstream.
- [ ] **App Home**: `sdk.onAppHomeOpened()`; persona presets + per-user custom instructions store.
- [ ] **Allowlist / onboarding**: opt-in gating (old `isUserAllowed` + opt-in flow).

## Research

- [ ] **`gorkie (dev)` credit exhaustion**: investigate why it ran out of inference/AI credits mid-task and decide whether quota handling, provider fallback, or cost gating needs changes.
- [ ] **Product ideas backlog**: keep online form filling, website builder/deployer, GitHub repo debugging assistant, Minecraft bot/server agent, guru/life-advice mode, and investing/cooking/flying-plane jokes as later ideas until explicitly prioritized.
- [ ] **Model output-token budgeting**: check whether high `maxOutputTokens` changes Mastra observability, memory persistence, provider routing, or agent behavior beyond provider preflight/billing checks; also research whether OpenRouter can avoid rejecting requests based on reserved output-token affordability.
- [ ] **Built output env loading**: confirm whether Mastra build intentionally drops `dotenv/config` from the standalone output, and decide whether local smoke should use `node --env-file=.env .mastra/output/index.mjs` or an explicit runtime env loader.
- [ ] **Mastra build disk-space blocker**: `bun run build` currently fails when copying the 9.1 GB `src/mastra/public/observability.duckdb` into `.mastra/output` with only 7.9 GB free. Decide whether to prune, relocate, or exclude that generated DB from build output.
- [ ] **Re-test screenshots/Playwright** now that the sandbox persists and the template pre-installs agent-browser.
- [ ] **Sandbox-lifecycle bump, raise the duration?** `processOutputStep` runs *before tool execution* (per Mastra docs), so our `e2b.setTimeout(SANDBOX_MS)` is already proactive, but `SANDBOX_MS` is only **5 min**, so a single `execute_command` running >5 min could pause mid-run. Reference uses ~21 min (`executionTimeoutMs + 60s`). Consider raising `SANDBOX_MS`; we `pause()` at turn end anyway, so the timeout is just an abandon-safety net.
- [ ] **Channels escape hatch**: if channels' all-in-one handling ever limits us, evaluate owning those pieces.
- [ ] Is having mastra dev only way for bot fine
