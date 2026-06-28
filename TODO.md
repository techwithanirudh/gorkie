# gorkie TODO

Source of truth for outstanding work. Grouped by area. See [DESIGN.md](./DESIGN.md) for architecture.

## Recently completed

- [x] **Ignore skills lockfile in cspell**: added `skills-lock.json` to cspell ignored paths so skill source names do not fail spelling CI.
- [x] **Refactor tool task rendering**: stopped duplicated tool input/output in Slack task cards, formatted JSON-only input/output cleanly, and preserved useful long command output without awkward truncation.
- [x] **Normalize tool task labels**: render tool names and field names as readable capitalized labels instead of raw underscore/camelCase identifiers.
- [x] **Redact huge model request logs**: stop dumped error logs from printing the full model request object and tool schemas when a provider call fails.
- [x] **Redact provider response headers in model errors**: keep useful provider error bodies visible, but hide noisy response headers from LLM failure logs.
- [x] **Add inference provider fallback**: add `INFERENCE_API_KEY` / `INFERENCE_BASE_URL` env support and include the same Kimi model in the gorkie model chain.
- [x] **Clean up inference model typing**: remove the awkward inline `satisfies ModelWithRetries[]` conditional from the gorkie model chain.

## Open questions (need your call)

- [ ] **`resourceId` for shared threads**: channels defaults to the first speaker's `slack:<userId>`. Key on the channel/thread instead (so memory belongs to the conversation, not one person)? Ties to OM scope (thread vs resource).
- [ ] **Observability store**: keep PG (warnings, no Studio discovery), or route the observability domain to ClickHouse/DuckDB via composite storage at higher volume? (DuckDB already wired for local.)

## Testing (E2E, needs you in Slack)

- [ ] Tool calling in **Slack** (programmatic test passes).
- [ ] **DM** conversation (gorkie replies to every message).
- [ ] **@mention in a new thread** → follows the whole thread; **@mention mid-thread** → answers once, re-fetches recent context.
- [ ] **Observational Memory + compaction**: long thread, confirm older history compresses and recall still works.
- [ ] **Sandbox stability**: can it build/serve a site; does the sandbox stay alive across turns.
- [ ] **Attachment handling end-to-end**: upload an image, confirm gorkie (a) sees it (vision via channels), (b) can read/modify it from the seeded sandbox path (`copyFilesToSandbox`), and (c) `get_file` works for files behind a **Slack canvas** (not just plain uploads).
- [ ] **Reasoning "Thinking" tasks** (deferred): surface model reasoning as a task. Needs reasoning chunks; they don't come through `ToolDisplayFn` (tool events only).
- Test out skip behavior

## Tools

- [ ] **Generative tools**: `generate_image`, `mermaid` (render + upload to the thread).
- [ ] **`search_slack` token plumbing cleanup**: the `captureSearchToken`/`getSearchToken` flow (grab the per-message Slack `action_token` from `message.raw` in the handlers, stash per-thread, read it back in the tool) is hacky. Find a cleaner way to plumb the action token to the tool.
- [ ] **Centralize model config (`providers.ts`)**: `agents/gorkie.ts`, `agents/summarizer.ts`, and the observational-memory config all repeat the same fallback arrays (Hack Club, OpenRouter, opencode-go). Extract the kimi chain and the gemini/deepseek chain into one place (e.g. `src/mastra/lib/providers.ts`) and import them, so model/URL/key changes happen once.

## Prompts

- [ ] **App Home / Assistant suggested prompts**: `channels.sdk.onAssistantThreadStarted` → `slack.setSuggestedPrompts(...)`. Part of the App Home phase.
- [ ] **User custom instructions**: inject the speaker's saved preset as `<user_instructions>` in the user message (not the system prompt, to keep caching). Core prompt already references it.
- [ ] Re-review old codebase prompts for anything missing (presets/personas, hints).

## Data / persistence

- [ ] **Port the reference's drizzle setup** (`gorkie-slack/apps/*`): schema + migrations + client for **custom instructions / presets**, allowlist/onboarding, App Home state. Mastra's `PostgresStore` owns memory/observability tables; this is *our* app data on the same shared Supabase Postgres. Decide: reuse the reference's tables or namespace gorkie's. Blocks: custom instructions, App Home presets, allowlist. Note `:6543` is the pooler, migrations may need the `:5432` direct URL.

## Features

- [ ] **Filesystem tools backed by the E2B sandbox**: bring back `read_file`/`write_file`/`edit_file`/`ast_edit`/`grep`/`list_files`, which need a `WorkspaceFilesystem`. There is **no** E2B-backed provider (Mastra ships Local/S3/Azure/GCS only; [#13133 dynamic filesystem resolution](https://github.com/mastra-ai/mastra/issues/13133), [#14104 Azure provider](https://github.com/mastra-ai/mastra/issues/14104) are related, none for E2B). Write a custom `WorkspaceFilesystem` wrapping `sandbox.e2b.files` (read↔readFile, write↔writeFile, list↔readdir, …), likely via a per-thread resolver (note: resolver-backed filesystem may conflict with `lsp: true`). Big upgrade over shelling out to `sed`.
- [ ] **`[Thread context]` mention encoding**: Mastra's auto-injected thread-context block HTML-escapes mentions (`&lt;@U…&gt;`) so the model reads escaped junk (our `read_conversation_history` output is clean). Decide: disable `threadContext` (`maxMessages: 0`) + rely on the tool, override the block, or report upstream.
- [ ] **App Home**: `sdk.onAppHomeOpened()`; persona presets + per-user custom instructions store.
- [ ] **Allowlist / onboarding**: opt-in gating (old `isUserAllowed` + opt-in flow).

## Research

- [ ] **Sandbox egress**: agent reported `transfer.sh` uploads not returning a URL from the sandbox. Check E2B outbound network; persistent sandbox + `upload_file` should cover most "share a file" needs.
- [ ] **Re-test screenshots/Playwright** now that the sandbox persists and the template pre-installs agent-browser.
- [ ] **Sandbox-lifecycle bump, raise the duration?** `processOutputStep` runs *before tool execution* (per Mastra docs), so our `e2b.setTimeout(SANDBOX_MS)` is already proactive, but `SANDBOX_MS` is only **5 min**, so a single `execute_command` running >5 min could pause mid-run. Reference uses ~21 min (`executionTimeoutMs + 60s`). Consider raising `SANDBOX_MS`; we `pause()` at turn end anyway, so the timeout is just an abandon-safety net.
- [ ] **Harness vs plain Agent**: evaluate whether we need Mastra's Harness (interruption/threading); if only parts, pull just those.
- [ ] **Channels escape hatch**: if channels' all-in-one handling ever limits us, evaluate owning those pieces.
- [ ] Is having mastra dev only way for bot fine
