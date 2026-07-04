# Gorkie Architecture & Design Decisions

## Overview

Gorkie is a **public** Slack coding-assistant bot. Stack:

- **Mastra**: agent runtime (memory, workspace/sandbox, model routing) **and** the Slack integration via its built-in `channels` feature
- **Chat SDK** (`chat` + `@chat-adapter/slack`): used *through* Mastra channels, not owned directly
- **Postgres** (`@mastra/pg`): persistent memory + channel state; **DuckDB** (`@mastra/duckdb`): observability spans, via a `MastraCompositeStore`
- **Observational Memory**: long-context memory (Observer/Reflector compress history)
- **E2B** (`@mastra/e2b`): isolated cloud sandbox for all code execution (never the host)
- **Observability** (`@mastra/observability` + `@mastra/langfuse`): tracing with secret redaction
- **Bun** runtime; **Biome/ultracite** lint+format, **cspell** spelling, **lefthook** + **commitlint** hooks

---

## We use Mastra `channels` (not a hand-rolled Chat SDK integration)

Earlier iterations owned the Chat SDK manually (`new Chat(...)`, custom `run-turn.ts`). That was a mistake, channels does everything we need. We keep control via **handler overrides**: `onMention`/`onSubscribedMessage`/`onDirectMessage` (`src/mastra/chat/handlers.ts`) call the channels `defaultHandler`, so we own subscription/ignore policy while reusing all of `processChatMessage`'s internals (message build, multi-user attributes, history backfill, `sendMessage` + native steering, subscription).

### What channels gives us for free

- **Socket Mode** (no webhook/tunnel), **token streaming** (`streaming: true`), **typing status**, **thread-history backfill** on first mention, **multi-user prefixing**, **MastraStateAdapter** (subscriptions persist in Postgres), and **built-in channel tools** (`add_reaction`/`remove_reaction`, `send_message`): `tools` defaults to `true`.
- `agent.getChannels().sdk` exposes the underlying `Chat` instance for extra handlers (App Home, etc.). Action handlers are an array, so ours coexist with channels' own.

### Tool display

`toolDisplay` is a **custom `ToolDisplayFn`** (`src/mastra/chat/tool-display.ts`) with `streaming: true`. It renders each tool as a `task_update` (keyed by `toolCallId`): title = tool, `details` = raw input, `output` = the tool's `message` (prefixed `*Error*:` on `success: false`) or the stringified result. A function-form `toolDisplay` resolves `groupTasks: undefined` → a flat **timeline**, not grouped. `formatError` posts *"Oops, something went wrong."* + the error.

---

## How a turn runs

1. Slack event over Socket Mode → our handler override → `shouldIgnore` check → `attachments` (describe attachments without downloading them) → `defaultHandler`.
2. Channels maps the platform thread to a Mastra thread (by `channel_*` metadata), backfills history on first mention, persists `channel_subscribed`.
3. Channels runs the agent via `agent.sendMessage(...)` (durable) + `subscribeToThread(...)`, streaming output back with our `toolDisplay`.
4. Output processors (`src/mastra/processors/`) run per step/turn: **sandbox-lifecycle** (bump the E2B timeout before sandbox tools; `pause()` at turn end) and **turn-log** (log every tool call + result).

---

## Model

A **fallback chain** of `moonshotai/kimi-k2.6` (`src/mastra/agents/gorkie.ts`), each entry `{ model: { id, apiKey, url }, maxRetries }`:

1. **Hack Club** proxy (`https://ai.hackclub.com/proxy/v1`, `HACKCLUB_API_KEY`), primary.
2. **OpenRouter** (`OPENROUTER_API_KEY` / `OPENROUTER_BASE_URL`): fallback. (Note: `.env` currently points this at Hack Club too; set a real `sk-or-…` key + base URL for a truly independent fallback.)
3. **`opencode-go`** (`https://opencode.ai/zen/go/v1`, `OPENCODE_API_KEY`): independent fallback.

Hack Club/OpenRouter speak the OpenRouter-compatible API, so we use explicit `url` + `apiKey` (OpenAICompatible) rather than Mastra's gateway. Observational memory and the summarizer agent use the same pattern with `google/gemini-2.5-flash` (+ `deepseek-v4-flash` on `opencode-go`, which has no gemini).

---

## Workspace & Sandbox (E2B, security-critical)

gorkie is public, so the agent must never run code on the host. The workspace (`src/mastra/workspace/index.ts`) uses a dynamic **`E2BSandbox`** (template `gorkie-workspace:1.0`, prebuilt via `bun run build:template`, agent-browser/agentmail/wrangler + Chromium baked in), resolved per request and memoized by `sandboxCacheKey` (thread id) so each thread gets a warm, isolated sandbox.

- **No host `LocalFilesystem`**: the agent gets sandbox tools only (`execute_command`, `get_process_output`, `kill_process`), renamed off the `mastra_workspace_` prefix via the `tools` config. File I/O is done via shell in the VM.
- **Skills** are discovered locally (`LocalSkillSource`, `workspace/skills` + `.`) from repo stubs. Mastra dev runs from `src/mastra/public`, so the source path falls back to the repo root from there. The E2B template also copies those stubs to `/home/user/skills` so sandbox filesystem access sees the same skill tree. Tools (agent-browser CLI, etc.) are baked into the sandbox template; the skill `SKILL.md`s are discovery stubs.
- **Lifecycle**: `processOutputStep` runs *before* tool execution, so the `e2b.setTimeout(SANDBOX_MS)` bump is proactive; `processOutputResult` calls `e2b.pause()` at turn end to stop paying for idle compute.

---

## Tools (`src/mastra/tools/`)

All custom tools are Mastra `createTool`s returning a uniform `{ success, message, ...data }` shape (the `message` feeds the tool display). Slack ids are handled with `lib/ids.ts` + the adapter natives (`slack.decodeThreadId` / `channelIdFromThreadId`).

`search_web`, `fetch_url`, `search_slack`, `read_conversation_history`, `list_threads`, `get_user`, `get_channel_info`, `get_file`, `upload_file` (native `thread.post({ files })`), `post_message`, `schedule_reminder`, `leave_thread`, `summarize_thread` (delegates to a summarizer subagent), `skip`. Plus the built-in channel reaction tools.

---

## Storage, Memory, Observability

- **Storage**: `MastraCompositeStore`: default `PostgresStore(DATABASE_URL)` (memory, channel state) + `DuckDBStore('./observability.duckdb')` for the observability domain.
- **Memory**: `new Memory({ lastMessages: 20, observationalMemory: { model: [gemini fallback chain], scope: 'thread' } })`. Short verbatim window + OM compression for long-context recall. Thread = Slack thread; resource = `slack:<userId>`.
- **Observability**: `MastraStorageExporter` (always) + `LangfuseExporter` (when keys set; `realtime` in dev), with a `SensitiveDataFilter`. Logging is `PinoLogger`.

---

## Ignoring messages

`shouldIgnore` (`src/mastra/chat/handlers.ts`) skips bots (`isBot` / `USLACKBOT` / `isMe`) and any message whose line starts with `##`, returns early instead of calling `defaultHandler` (ported 1:1 from the reference).

---

## Layout

| Path | Role |
|---|---|
| `src/mastra/index.ts` | Mastra instance (composite storage + agents) + the channels bootstrap (`getChannels().initialize()`). This is the entry, `mastra dev`/`build`/`start` use it. |
| `src/mastra/agents/` | `gorkie.ts` (model fallback, memory, workspace, channels config) + `summarizer.ts` |
| `src/mastra/chat/` | `handlers.ts`, `slack.ts`, `instance.ts`, `tool-display.ts`, `attachments.ts`, `names.ts`, `search-token.ts`, `message.ts`, `events.ts` |
| `src/mastra/tools/` | the custom `createTool`s + `utils.ts` |
| `src/mastra/processors/` | `sandbox-lifecycle.ts`, `turn-log.ts`, `index.ts` (the `outputProcessors` array) |
| `src/mastra/workspace/` | `index.ts` (sandbox + skills), `config.ts`, `build-template.ts` |
| `src/mastra/prompts/` | composable system prompt |
| `src/mastra/lib/` | `context.ts` (`channelContext`), `ids.ts` (`rawId`/`chatChannelId`) |
| `src/mastra/types/` | `channel.ts`, `thread.ts`, `index.ts` (barrel) |
| `src/env.ts` | Zod-validated env. Imported via the `@/` alias (`@/env`); other cross-dir imports stay relative |
| `workspace/skills/` | committed skill stubs (agent-browser, agentmail, wrangler) |

There is **no** root `index.ts` entry, mastra owns the lifecycle. Tooling: `biome.jsonc`, `.cspell.jsonc`, `lefthook.yml`, `commitlint.config.ts`, `.github/workflows/ci.yml` (+ `.github/actions/setup`).
