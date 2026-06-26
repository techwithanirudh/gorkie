# Gorkie Architecture & Design Decisions

## Overview

Gorkie is a Slack coding assistant bot. The stack is:

- **Mastra** — agent runtime (memory, workspace/sandbox, model routing) **and** the Slack integration via its built-in `channels` feature
- **Chat SDK** (`chat` + `@chat-adapter/slack`) — used *through* Mastra channels, not owned directly
- **Postgres** (`@mastra/pg`) — persistent storage: memory, channel state, observability traces
- **Observational Memory** — long-context memory (Observer/Reflector compress history)
- **E2B** (`@mastra/e2b`) — isolated cloud sandbox for all code execution (never the host)
- **Observability** (`@mastra/observability` + `@mastra/langfuse`) — tracing with secret redaction
- **Bun** — runtime

---

## We use Mastra `channels` (not a hand-rolled Chat SDK integration)

Earlier iterations owned the Chat SDK manually (`new Chat(...)`, custom handlers, a custom `run-turn.ts`). That was a **mistake** based on wrong assumptions. We verified against `@mastra/core@1.46` source that channels does everything we need.

### What channels gives us for free

- **Socket Mode** — `channels.initialize()` → `chat.initialize()` starts the Slack adapter's Socket Mode. No webhook, no tunnel, no HTTP server. (The gateway reconnection loop only runs for Discord-style adapters.)
- **Real token streaming** — `streaming: true` (Slack default) streams text deltas to Slack via post-and-edit.
- **Tool display widgets** — `toolDisplay: 'grouped'` (Slack default) renders live `task_update` chunks; also `timeline`, `cards`, `text`, `hidden`.
- **Typing status**, **thread-history backfill** (last 10 messages on first mention), **multi-user prefixing**, **tool approval cards**, **MastraStateAdapter** (auto-wired from Mastra storage), **reaction tools** (`add_reaction`/`remove_reaction`).

### What channels does NOT cover — and how we'll add it (deferred)

Channels only registers an `onAction` handler for `tool_approve:`/`tool_deny:`. For anything else, `agent.getChannels().sdk` exposes the underlying `Chat` instance, explicitly "to register additional event handlers."

Chat SDK keeps action handlers in an **array** and dispatches to all of them, so future handlers will coexist with the channels-internal ones (not yet wired — see roadmap):

- **Stop button** — `sdk.onAction('stop_turn', …)` resolves the Mastra thread for the click's chat thread (metadata lookup) and calls `agent.abortThreadStream({ resourceId, threadId })` (public API).
- **App Home** (Phase 6) — `sdk.onAppHomeOpened(…)` on the same instance.

To register these later: `await agent.getChannels().initialize(mastra)` (idempotent), then read `agent.getChannels().sdk` and call `sdk.onAction(...)` / `sdk.onAppHomeOpened(...)`.

### Why the original "own Chat SDK" reasoning was wrong

| Old claim | Truth (verified in source) |
|---|---|
| Socket Mode needs us to own Chat | `channels` starts it via `chat.initialize()`. |
| Stop button needs a custom `onAction` we can't add | `channels.sdk.onAction(...)` coexists (handlers are an array). |
| No way to abort a run | `agent.abortThreadStream()` / `agent.abortRunStream()` are public. |
| App Home unsupported | `sdk.onAppHomeOpened()` exists. |

---

## How a turn runs (channels-managed)

1. Slack event arrives over Socket Mode → channels' `onNewMention`/`onDirectMessage`/`onSubscribedMessage`.
2. Channels maps the platform thread to a Mastra thread (UUID, looked up by `channel_platform` / `channel_externalThreadId` / `channel_externalChannelId` metadata), backfilling thread history on first mention.
3. Channels calls `agent.sendMessage(...)` (durable pattern) and consumes the run via `agent.subscribeToThread(...)`, streaming output back to Slack with the configured `toolDisplay`/`streaming`.
4. Memory and channel state persist in LibSQL.

We no longer call `agent.stream()` ourselves — channels uses the durable `sendMessage` + `subscribeToThread` path, which is more robust (survives restarts, supports multi-instance).

---

## Model

`openrouter/minimax/minimax-m3` via Mastra's built-in `openrouter` provider.

Hack Club runs an **OpenRouter-compatible** AI proxy (same slugs, same API shape). We use the built-in provider with a base-URL override:

```bash
OPENROUTER_API_KEY=sk-hc-v1-...                       # Hack Club key
OPENROUTER_BASE_URL=https://ai.hackclub.com/proxy/v1  # Hack Club proxy
```

Mastra's `ModelsDevGateway.buildUrl()` reads `<PROVIDER>_BASE_URL` and feeds it to `createOpenRouter({ apiKey, baseURL })`. No custom gateway, no extra AI SDK package. To use real OpenRouter, drop `OPENROUTER_BASE_URL` and set a real `OPENROUTER_API_KEY`.

---

## Workspace & Sandbox (E2B — security-critical)

gorkie is a **public** bot, so the agent must never run code on our host. The workspace uses a dynamic **`E2BSandbox`** (isolated cloud Linux VM), resolved per request and memoized by `sandboxCacheKey` (thread-id), so each Slack thread gets its own warm sandbox across turns while staying isolated from other threads.

We deliberately attach **no host `LocalFilesystem`** — the agent only gets `execute_command` against the E2B VM, and does file I/O via shell there. `E2BSandbox` reads `E2B_API_KEY` from env; the resolver runs at tool-execution time (not startup), so the bot boots fine even before any sandbox spins up.

---

## Storage — Postgres

`PostgresStore({ connectionString: DATABASE_URL })` from `@mastra/pg` backs everything: agent memory, observational-memory log, channel state (`MastraStateAdapter`), and observability spans. Mastra auto-creates its tables on first run (`mastra_messages`, `mastra_observational_memory`, `mastra_channel_config`, `mastra_ai_spans`, …).

---

## Memory — Observational Memory

`new Memory({ options: { lastMessages: 20, observationalMemory: { model: 'openrouter/google/gemini-2.5-flash' } } })`.

A short verbatim window (20 messages) plus OM: background **Observer/Reflector** agents compress older history into a dense observation log, giving long-context recall without carrying raw history. The OM model routes through our `openrouter` provider (Hack Club) since we don't configure a Google key directly. OM is thread-scoped; channels always provides a `threadId`. Thread = Slack thread; resource = `slack:<userId>`.

---

## Observability

`new Observability({ configs: { default: { serviceName: 'gorkie', exporters, spanOutputProcessors: [new SensitiveDataFilter()] } } })`.

- `MastraStorageExporter` — always on; writes spans to Postgres.
- `LangfuseExporter` — added only when `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` are set (`langfuseEnabled` in `src/env.ts`); `realtime` in dev.
- `SensitiveDataFilter` redacts secrets before export. Logging is `PinoLogger` (debug in dev, info otherwise).

---

## Ignoring messages

Any message with a line starting with `##` is skipped. Implemented via channels `handlers` (`onMention`/`onDirectMessage`/`onSubscribedMessage`) wrapping the default handler with `shouldIgnore` (`src/mastra/channels/handlers.ts`) — return early instead of calling `defaultHandler`.

---

## File map

| File | Role |
|---|---|
| `src/mastra/index.ts` | Mastra instance (storage + agent). Constructing it brings channels online. |
| `src/mastra/agents/gorkie.ts` | Agent: model, memory, workspace, **and the `channels` config** (Slack socket adapter, streaming, toolDisplay). |
| `src/mastra/workspace/index.ts` | Per-thread sandbox workspace. |
| `src/env.ts` | Zod-validated env (Slack tokens, OpenRouter/Hack Club, E2B). |
| `index.ts` | Entry: construct Mastra → await `channels.initialize()` → graceful shutdown (`channels.close()`). |

Custom-interaction wiring (stop button / App Home) on `channels.sdk` is deferred — it'll live in a small `src/mastra/channels/` module when built.

(The hand-rolled `src/mastra/chat/` — `index.ts`, `bot.ts`, `run-turn.ts`, `turns.ts` — was deleted in the channels migration.)

---

## Phase roadmap

| Phase | What |
|-------|------|
| ✅ 1 | Channels-based core: Socket Mode, streaming, tool widgets, memory, sandbox |
| 2 | Stop button **Block Kit card** (`stop_turn` action wiring is done; needs the card posted during a run) |
| 3 | E2B sandbox swap |
| 4 | Custom Mastra `createTool()` tools |
| 5 | Composable system prompt |
| 6 | App Home (`sdk.onAppHomeOpened`) |
| 7 | Polish (allowlist, onboarding, error formatting, observability) |
