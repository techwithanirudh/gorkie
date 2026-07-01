# gorkie TODO

Source of truth for outstanding work. Grouped by area. See [DESIGN.md](./DESIGN.md) for architecture.

## Priority queue

- [ ] **P0: GLM image input crash**: uploaded images can crash GLM/non-vision models. Detect model image support before Mastra sends image parts, and degrade to file/path text for models that do not support images.
- [ ] **P0: Model quota error handling**: daily spending-limit 429s should stop retrying, surface a clear Slack message, and optionally fall back to another model/provider.
- [ ] **P0: Provider/log redaction**: upstream model errors can persist full provider response bodies, provider key-management URLs, and giant HTML error pages in observability/logs. Sanitize `APICallError` bodies before logging and storage export.
- [ ] **P0: Background Slack file downloads**: evaluate Mastra background tasks for `get_file` so large user-requested downloads can outlive foreground tool timeouts and report completion cleanly.
- [ ] **P0: `get_file` cleanup audit**: chunked downloads are reliable but cluttered. Re-check whether the Ky direct bearer-token path can replace `fetchSlackFile` safely long-term, and simplify the chunk/manifest code without losing resume guarantees.
- [ ] **P0: Sandbox image file viewing bug**: viewing images from files in the sandbox is currently bugged. `read_file` media is disabled because Mastra sends base64 tool results through a broken media path; fix upstream or add a safe replacement before re-enabling. [might be related to opencode go and might wrk fine with all other providers]
- [ ] **P0: Skills**: add more workspace skills now that current skill discovery/tool exposure is working.
- [ ] **Later: Tool display preference**: let users choose hidden vs original/visible tool display mode.

## Open questions (need your call)

- [ ] **`resourceId` for shared threads**: channels defaults to the first speaker's `slack:<userId>`. Key on the channel/thread instead (so memory belongs to the conversation, not one person)? Ties to OM scope (thread vs resource).

## Recently completed

- [x] **Sandbox lifecycle and join-channel parity check**: verified all E2B-using tools use Mastra lifecycle helpers correctly, compared channel-history tools against the old auto-join behavior, and restored the missing bot-added-to-channel greeting.
- [x] **E2B lifecycle startup fix**: use Mastra sandbox `ensureRunning()` instead of direct `start()` for E2B filesystem, `get_file`, and `upload_file`; remove the local `sandboxStarts` workaround.
- [x] **Lazy Slack attachment downloads**: message attachments are no longer automatically copied into the sandbox. The model sees attachment metadata and can call `get_file` only when it needs file bytes; explicit `get_file` downloads now honor Mastra abort signals.
- [x] **Numbered chunk Slack downloads**: `get_file` now uses Ky plus numbered chunk files (`.part.00000`, etc.) for known-size Slack files, resumes by skipping complete chunks, and completed a 568,059,725-byte zip validation with `unzip -t`.
- [x] **`get_file` library survey**: checked resumable downloader packages, range-parser utilities, and generic HTTP clients. One package has a close internal writer abstraction, but its public Node API still targets local files.
- [x] **Download library viability research**: verified the candidate package exports, Node API, browser API, custom writer behavior, saved progress shape, and a local range-server resume probe before deciding whether to refactor `get_file` around it.
- [x] **E2B filesystem start guard review**: checked `sandboxStarts` against Mastra filesystem lifecycle and `@mastra/e2b` start/retry behavior; it only dedupes concurrent initial starts.
- [x] **Mastra filesystem lifecycle comparison**: checked LocalFilesystem, CompositeFilesystem, workspace tool wrappers, lifecycle helpers, and sandbox process manager patterns; upstream prefers lifecycle wrappers/`ensureRunning()` over direct `start()`.
- [x] **Slack search output cleanup**: removed `isAuthorBot` and `ts` from compact search results; kept permalinks as source pointers for exact Slack messages.
- [x] **Attachment logging cleanup**: turn-start logs include attachment names, MIME types, sizes, and Slack URLs; the attachment context helper is now named `attachments`.
- [x] **Streamed Slack file downloads**: `get_file` no longer buffers full Slack files in host memory. It streams the Slack response body into an E2B `.part` file, verifies size when known, then renames it into place.
- [x] **Resumable Slack file downloads**: `get_file` resumes from an existing `.part` file with HTTP `Range` when Slack supports it, appends the remaining bytes in the sandbox, and falls back to a clean restart when range requests are not supported.
- [x] **Large-file timeout test**: tested `get_file` on a huge Slack zip with 30s and 60s forced aborts, then completed the retry. Final zip was 568,059,725 bytes and `unzip -t` reported no errors.
- [x] **Slack search output research**: Slack `assistant.search.context` can return contextual before/after messages, up to 20 results per page, and cursors. Bot-token calls require `action_token`; user-token calls do not. Compact model output is needed.
- [x] **Token limiter research**: current Mastra `TokenLimiterProcessor` runs per step, counts tool-result JSON, removes whole old messages, and can TripWire if nothing fits. It is a hard guard, not a semantic compressor.
- [x] **Observational memory token-limit research**: `MessageHistory` recalls `lastMessages` before later per-step pruning, and observational memory is separate from live prompt compression. Need tests before assuming a limiter will not affect recall quality.
- [x] **Token limiter loop probe**: local probe with a huge old Slack tool result kept the current user request and latest tool result under both `best-fit` and `contiguous`; system-message preservation still needs validation with real Mastra `MessageList`.
- [x] **Input context/token guard**: added a Mastra `TokenLimiterProcessor` input guard with contiguous trimming, and compacted Slack search output so raw context JSON no longer reaches model/tool display/log result payloads.
- [x] **Resumed file download abort progress**: `get_file` now preserves an aborted `.part.range` by folding it into `.part` before the next resume request.
- [x] **`get_file` resume under timeout follow-up**: repeated the huge Slack zip test with 30s, 60s, 10s, and 5s aborts. `.part` advanced from 70,760,314 to 263,606,525 to 272,535,797 bytes, final zip was 568,059,725 bytes, and `unzip -t` passed.
- [x] **Slack search compact-output probe**: synthetic 10-result Slack search output dropped from 254,519 bytes to 18,859 bytes, a 93% reduction, while preserving author, user, channel, timestamp, permalink, snippets, and cursor.

## Testing (E2E, needs you in Slack)

- [ ] **Images without extensions**: fix `read_file` on downloaded images/binaries without file extensions so it detects MIME from bytes instead of dumping raw binary text.
- [ ] Tool calling in **Slack** (programmatic test passes).
- [ ] **DM** conversation (gorkie replies to every message).
- [ ] **@mention in a new thread** → follows the whole thread; **@mention mid-thread** → answers once, re-fetches recent context.
- [ ] **Observational Memory + compaction**: long thread, confirm older history compresses and recall still works.
- [ ] **Sandbox stability**: can it build/serve a site; does the sandbox stay alive across turns.
- [ ] **Attachment handling end-to-end**: upload an image, confirm gorkie (a) sees it through channels, (b) receives lazy attachment metadata without downloading first, and (c) `get_file` works for files behind a **Slack canvas** (not just plain uploads).
- [ ] **Attachment input/output rendering**: confirm attachments resolve properly in model input and tool/task output, including lazy metadata and `get_file` results.
- [ ] **Slack search compact-output test**: after researching a compact `search_slack` model output shape, test repeated broad Slack searches in one turn and confirm the model sees concise hits plus cursors instead of giant context JSON.
- [ ] **Token limiter loop test**: after researching the Mastra `TokenLimiterProcessor` settings, run a tool-heavy multi-step turn and confirm per-step pruning prevents context overflow without deleting the active user request or latest tool result.
- [ ] **Observational memory token-limit test**: test whether an input token limiter interferes with observational memory, long-thread recall, or observation/reflection writes, especially when older messages are pruned from the live model prompt.
- [ ] **Tool-result media vision**: `read_file` workspace media is disabled because sandbox image/PDF tool results can send base64 through a bugged Mastra media path. Trace model/provider media support and Mastra tool-result conversion before re-enabling.
- [ ] **Mention input/output rendering**: confirm Slack mentions resolve properly in model-visible input, thread context, history/tool output, and final Slack replies.
- [ ] **Reasoning "Thinking" tasks** (deferred): surface model reasoning as a task. Needs reasoning chunks; they don't come through `ToolDisplayFn` (tool events only).
- [ ] **Skip tool behavior**: test that `skip` stops the agent loop and renders the expected Slack task state.
- [ ] **Skill tool task UI**: confirm `skill`, `skill_search`, and `skill_read` render or suppress task UI exactly as intended.
- [ ] **Filesystem tools in Slack**: confirm `read_file`, `write_file`, `edit_file`, `list_files`, `grep`, `delete_file`, `file_stat`, and `mkdir` work through Slack and render cleanly.
- [ ] **Full filesystem provider audit**: compare E2B filesystem against LocalFilesystem, CompositeFilesystem, AgentFS/remote providers, and E2B mount/S3/FUSE code for edge-case parity.
- [ ] **Full tool robustness audit**: review all repo tools plus installed Mastra workspace tools for direct E2B access, stale sandbox recovery, path handling, and output/media behavior.
- [ ] **Slack skill activation**: investigate Slack `skill` tool reporting `Skill "wrangler" not found` even though programmatic `skill_search` and `skill` can see Wrangler.
- [ ] **Slack skill registry after restart**: restart the bot and confirm `skill_search("agent")`, `skill_search("agent-browser")`, and `skill("wrangler")` return local skills in Slack.
- [ ] **All tool smoke tests**: test every registered tool in Slack, including `mermaid` and `getUser`/user lookup behavior.
- [ ] **Tool caching parity**: validate caching behavior for all tools against the reference code.

## Tools

- [ ] **Generative tools**: `generate_image` (render + upload to the thread).
- [ ] **`search_slack` token plumbing cleanup**: the `captureSearchToken`/`getSearchToken` flow (grab the per-message Slack `action_token` from `message.raw` in the handlers, stash per-thread, read it back in the tool) is hacky. Find a cleaner way to plumb the action token to the tool.

## Prompts

- [ ] **App Home / Assistant suggested prompts**: `channels.sdk.onAssistantThreadStarted` → `slack.setSuggestedPrompts(...)`. Part of the App Home phase.
- [ ] **User custom instructions**: inject the speaker's saved preset as `<user_instructions>` in the user message (not the system prompt, to keep caching). Core prompt already references it.

## Data / persistence

- [ ] **Port the reference's drizzle setup** (`gorkie-slack/apps/*`): schema + migrations + client for **custom instructions / presets**, allowlist/onboarding, App Home state. Mastra's `PostgresStore` owns memory/observability tables; this is *our* app data on the same shared Supabase Postgres. Decide: reuse the reference's tables or namespace gorkie's. Blocks: custom instructions, App Home presets, allowlist. Note `:6543` is the pooler, migrations may need the `:5432` direct URL.

## Features

- [ ] **Add more skills**: expand available skills after current skill loading is fixed.
- [ ] **Tool display preference**: future lower-priority feature, let users choose hidden vs original/visible tool display mode.
- [ ] **Agent browser**: consider adding a proper agent browser integration instead of relying on ad hoc browser tooling.
- [ ] **Image-capable file reads**: fix sandbox file image viewing. Mastra's read-file media path is currently unsafe/bugged for our provider path.
- [ ] **`[Thread context]` mention encoding**: Mastra's auto-injected thread-context block HTML-escapes mentions (`&lt;@U…&gt;`) so the model reads escaped junk (our `read_conversation_history` output is clean). Decide: disable `threadContext` (`maxMessages: 0`) + rely on the tool, override the block, or report upstream.
- [ ] **App Home**: `sdk.onAppHomeOpened()`; persona presets + per-user custom instructions store.
- [ ] **Allowlist / onboarding**: opt-in gating (old `isUserAllowed` + opt-in flow).

## Research

- [ ] **Model output-token budgeting**: check whether high `maxOutputTokens` changes Mastra observability, memory persistence, provider routing, or agent behavior beyond provider preflight/billing checks; also research whether OpenRouter can avoid rejecting requests based on reserved output-token affordability.
- [ ] **Built output env loading**: confirm whether Mastra build intentionally drops `dotenv/config` from the standalone output, and decide whether local smoke should use `node --env-file=.env .mastra/output/index.mjs` or an explicit runtime env loader.
- [ ] **Re-test screenshots/Playwright** now that the sandbox persists and the template pre-installs agent-browser.
- [ ] **Sandbox-lifecycle bump, raise the duration?** `processOutputStep` runs *before tool execution* (per Mastra docs), so our `e2b.setTimeout(SANDBOX_MS)` is already proactive, but `SANDBOX_MS` is only **5 min**, so a single `execute_command` running >5 min could pause mid-run. Reference uses ~21 min (`executionTimeoutMs + 60s`). Consider raising `SANDBOX_MS`; we `pause()` at turn end anyway, so the timeout is just an abandon-safety net.
- [ ] **Harness vs plain Agent**: evaluate whether we need Mastra's Harness (interruption/threading); if only parts, pull just those.
- [ ] **Channels escape hatch**: if channels' all-in-one handling ever limits us, evaluate owning those pieces.
- [ ] Is having mastra dev only way for bot fine
