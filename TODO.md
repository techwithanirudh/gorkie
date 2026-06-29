# gorkie TODO

Source of truth for outstanding work. Grouped by area. See [DESIGN.md](./DESIGN.md) for architecture.

## Open questions (need your call)

- [ ] **`resourceId` for shared threads**: channels defaults to the first speaker's `slack:<userId>`. Key on the channel/thread instead (so memory belongs to the conversation, not one person)? Ties to OM scope (thread vs resource).

## Testing (E2E, needs you in Slack)

- [ ] Tool calling in **Slack** (programmatic test passes).
- [ ] **Tool display regressions**: tool display is still buggy for some tools, especially `execute_command` input and skill output rendering.
- [ ] **DM** conversation (gorkie replies to every message).
- [ ] **@mention in a new thread** → follows the whole thread; **@mention mid-thread** → answers once, re-fetches recent context.
- [ ] **Observational Memory + compaction**: long thread, confirm older history compresses and recall still works.
- [ ] **Sandbox stability**: can it build/serve a site; does the sandbox stay alive across turns.
- [ ] **Attachment handling end-to-end**: upload an image, confirm gorkie (a) sees it (vision via channels), (b) can read/modify it from the seeded sandbox path (`copyFilesToSandbox`), and (c) `get_file` works for files behind a **Slack canvas** (not just plain uploads).
- [ ] **Attachment input/output rendering**: confirm attachments resolve properly in model input and tool/task output, including seeded sandbox paths and `get_file` results.
- [ ] **Mention input/output rendering**: confirm Slack mentions resolve properly in model-visible input, thread context, history/tool output, and final Slack replies.
- [ ] **Reasoning "Thinking" tasks** (deferred): surface model reasoning as a task. Needs reasoning chunks; they don't come through `ToolDisplayFn` (tool events only).
- [ ] **Skip tool behavior**: test that `skip` stops the agent loop and renders the expected Slack task state.
- [ ] **Skill tool task UI**: confirm `skill`, `skill_search`, and `skill_read` render or suppress task UI exactly as intended.
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

- [ ] **Skills not loading**: investigate why skills are not loaded.
- [ ] **Filesystem tools backed by the E2B sandbox**: bring back `read_file`/`write_file`/`edit_file`/`ast_edit`/`grep`/`list_files`, which need a `WorkspaceFilesystem`. There is **no** E2B-backed provider (Mastra ships Local/S3/Azure/GCS only; [#13133 dynamic filesystem resolution](https://github.com/mastra-ai/mastra/issues/13133), [#14104 Azure provider](https://github.com/mastra-ai/mastra/issues/14104) are related, none for E2B). Write a custom `WorkspaceFilesystem` wrapping `sandbox.e2b.files` (read↔readFile, write↔writeFile, list↔readdir, …), likely via a per-thread resolver (note: resolver-backed filesystem may conflict with `lsp: true`). Big upgrade over shelling out to `sed`.
- [ ] **Agent browser**: consider adding a proper agent browser integration instead of relying on ad hoc browser tooling.
- [ ] **Image-capable file reads**: check whether Mastra's read-file tooling can let the agent view images when reading files.
- [ ] **`[Thread context]` mention encoding**: Mastra's auto-injected thread-context block HTML-escapes mentions (`&lt;@U…&gt;`) so the model reads escaped junk (our `read_conversation_history` output is clean). Decide: disable `threadContext` (`maxMessages: 0`) + rely on the tool, override the block, or report upstream.
- [ ] **App Home**: `sdk.onAppHomeOpened()`; persona presets + per-user custom instructions store.
- [ ] **Allowlist / onboarding**: opt-in gating (old `isUserAllowed` + opt-in flow).

## Research

- [ ] **Re-test screenshots/Playwright** now that the sandbox persists and the template pre-installs agent-browser.
- [ ] **Sandbox-lifecycle bump, raise the duration?** `processOutputStep` runs *before tool execution* (per Mastra docs), so our `e2b.setTimeout(SANDBOX_MS)` is already proactive, but `SANDBOX_MS` is only **5 min**, so a single `execute_command` running >5 min could pause mid-run. Reference uses ~21 min (`executionTimeoutMs + 60s`). Consider raising `SANDBOX_MS`; we `pause()` at turn end anyway, so the timeout is just an abandon-safety net.
- [ ] **Harness vs plain Agent**: evaluate whether we need Mastra's Harness (interruption/threading); if only parts, pull just those.
- [ ] **Channels escape hatch**: if channels' all-in-one handling ever limits us, evaluate owning those pieces.
- [ ] Is having mastra dev only way for bot fine
