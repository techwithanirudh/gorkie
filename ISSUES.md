# Upstream Mastra issues

Workarounds this repo carries that a native Mastra fix would delete. Each entry
records what we do, the gap that forces it, and what the upstream fix looks like.

Verified against `@mastra/core@1.59.0`, `@mastra/e2b@0.8.2`, `@mastra/mcp@1.16.0`
as vendored in `node_modules/`.

> **Partially updated.** `@mastra/core` is now `1.60.1-alpha.0` and the patch has
> been rebased onto it. Verified against upstream `main` source (not a local
> `node_modules` tree, which may already be patched):
>
> - 1.1 media token counting: **fixed upstream** (`estimateMediaTokens` in
>   `packages/core/src/processors/processors/token-limiter.ts`). Our hunk can go.
> - 1.2 `isContinued` on `step-finish`: **not fixed upstream**. Still needed.
>   Filed as [#21884](https://github.com/mastra-ai/mastra/issues/21884), together
>   with the `finish` close (1.3), since `output-processor.ts` documents both as
>   wrong.
> - 1.4 fallback-model escalation: **not fixed upstream**. Still needed.
>
> An earlier revision of this file claimed 1.2 and 1.4 were fixed. That was read
> off a patched `node_modules` and was wrong.

## 1. Patched `@mastra/core`

`patches/@mastra+core@1.60.1-alpha.0.patch` carries two behavioural fixes, applied to
`dist/agent-*.{js,cjs}`. `scripts/postbuild.ts`
exists only to copy `patches/` and `patchedDependencies` into `.mastra/output`
so a built server keeps them.

### 1.1 `TokenLimiterProcessor` counts base64 media as text

`TokenLimiterProcessor` runs `JSON.stringify` over `file` parts and over tool
results shaped `{ data, mediaType }`, so a single screenshot's base64 payload is
counted character by character. Input trimming then evicts real conversation to
make room for a token count that does not exist.

Patch: estimate from decoded byte size, clamped to 200-4000 tokens, with the
765/258 flat fallbacks for image and non-image parts.

Native fix: token accounting that understands multimodal parts instead of
stringifying them. Tracked locally in `TODO.md` as the "temporary Mastra media
token-count patch".

### 1.2 Channels streaming driver finalizes a Slack message mid-retry

`runStreamingDriver` calls `closeSession()` on every `step-finish` when
`toolDisplay !== 'grouped'`, ignoring `stepResult.isContinued`. A retry or a
fallback-model escalation is a continued step, so the Slack message is finalized
before the retry's output arrives. It also closed again on `finish`.

Patch: skip the close when `isContinued === true`, drop the `finish` close.
`ChatChannelOutputProcessor` already performs the same `isContinued` check on
the same chunk type, so the driver is simply inconsistent with it.

Native fix: honour `isContinued` in the driver.

### 1.3 Fallback models only escalate on failure-to-start

When a model errors after its own retries are exhausted, `createLLMExecutionStep`
throws instead of advancing to the next entry in the `models` array. The rest of
the fallback list never gets a turn. This applies both to the synchronous throw
path and to errors that surface after streaming has begun. Separately, the
processor retry count carried over into the next model rather than resetting.

Patch: advance `activeFallbackModelIndex` on error when a next model exists, and
reset `processorRetryCount` to 0 on a model switch.

Impact here: `src/mastra/providers.ts` configures a fallback per agent
(`openai/gpt-5.6-luna` then `opencode-go/deepseek-v4-flash`). Without the patch
the second entry is close to dead weight.

Native fix: treat "model errored" and "model failed to start" identically for
fallback escalation, and give each model its own retry budget.

### 1.4 Terminal error chunks bypass output processors

`MastraModelOutput` withholds raw error chunks from output processors so that a
retryable failure never renders. But the terminal deferred-error chunk and the
`workflowLoopStream` failure path both `safeEnqueue` straight to the controller,
so nothing renders them either. An exhausted fallback fails silently: no reply
in Slack, no error card.

Patch: route both through `outputWriter`, and let `error` /
`finish(reason: 'error')` chunks reach the processors in the `trip-wire`
transform.

Native fix: one code path where the terminal error is always processor-visible.

### 1.5 `tryRepairJson` cannot recover concatenated tool-call JSON

Not yet patched, logged in `TODO.md`. `openai/gpt-5.6-luna` occasionally streams
two complete tool calls' JSON glued together under one tool-call id.
`tryRepairJson` only handles single-object malformations (missing quotes,
trailing commas), so args come back `undefined`, the call fails validation, and
the resulting broken history message can trigger a `400` from whichever provider
gets the next request. Same class as the upstream-documented Kimi/K2 issue
(`mastra-ai/mastra#11078`).

Native fix: detect a `}{` boundary at brace depth 0 outside strings and keep the
first balanced object.

## 2. Workspace and sandbox

### 2.1 No E2B filesystem provider

Filed as [#21875](https://github.com/mastra-ai/mastra/issues/21875). Still
absent in `@mastra/e2b@0.9.0`.

`@mastra/e2b` exports `E2BSandbox` and `E2BCodeModeTransport` but no
`MastraFilesystem`. `src/mastra/workspace/filesystem.ts` is a 527-line
hand-written `E2BFilesystem`: path resolution, read/write/edit, stat, list,
copy, remove, mime lookup, and the full `@mastra/core/workspace` error taxonomy
(`FileNotFoundError`, `IsDirectoryError`, `StaleFileError`, and the rest) mapped
from E2B's own errors.

Native fix: ship `E2BFilesystem` in `@mastra/e2b` the way `LocalFilesystem`
ships in core.

### 2.2 Built-in workspace grep hangs on large trees

`src/mastra/workspace/index.ts:85-86` disables `WORKSPACE_TOOLS.FILESYSTEM.GREP`
with the note that the network-bound implementation hangs, and
`src/mastra/tools/grep.ts` replaces it with 203 lines shelling out to `rg --json`
inside the sandbox and reassembling the output.

Native fix: run grep in the sandbox when one is present, rather than pulling
file contents across the network.

Filed upstream: [mastra-ai/mastra#21877](https://github.com/mastra-ai/mastra/issues/21877).

### 2.3 Workspace tools silently shadow the agent's own `tools:`

In the agent bundle the request-resolved tool map spreads `assignedTools` first
and `workspaceTools` later. A tool defined in the agent's `tools:` config under
the same name as a workspace tool is overwritten with no warning.

This blocked giving `execute_command` a model-authored title for the typing
status. A wrapper was built and reverted: the only way to own the name is to
rename the built-in through the workspace tools config, and the renamed tool
stays visible to the model anyway, since the agent's `tools:` config cannot
remove a workspace tool from the list either. Not worth the duplicate tool.

Native fix: let the agent's explicit `tools:` win, or at minimum warn on
collision.

### 2.4 No sandbox lifecycle hook

`src/mastra/processors/sandbox.ts` piggybacks on output processors to run E2B
lifecycle: `processOutputStep` extends the sandbox timeout when the step used a
sandbox-touching tool, `processOutputResult` pauses it at turn end. The
"sandbox-touching" test is a hardcoded name set (`workspaceToolNames` plus
`slack`, `get_slack_file`, `upload_file`, `grep`) that has to be kept in sync by
hand.

Native fix: `Workspace`-level turn-start/turn-end hooks, so keepalive and pause
are not the agent's problem and the tool set does not need restating.

## 3. Code mode

### 3.1 `createCodeMode` takes a static tools map

`CodeModeConfig.tools` is read once in `createCodeModeTool` (`indexToolsById`),
so there is no per-request tool resolution, unlike `Agent.tools` which accepts a
`({ requestContext }) => tools` function.

`src/mastra/tools/code-mode/slack.ts` therefore overrides `mode.tool.execute`
and rebuilds the code mode instance on every call, just to get per-request
tools. It has to: `createWorkspaceTools` bakes a read-before-write tracker and
write lock into each tool set, and sharing those across threads would let one
thread's sandbox satisfy or stale-fail another thread's writes.

Native fix: accept `tools` as a function of the request context, the same shape
`Agent` already accepts. That deletes the `execute` override entirely.

### 3.2 Code mode does not resolve a resolver-backed sandbox

Filed as [#21886](https://github.com/mastra-ai/mastra/issues/21886).

`createCodeModeTool` reads `config.sandbox ?? ctx?.workspace?.sandbox`, and the
`Workspace.sandbox` getter returns only `this._sandbox`, which stays undefined
when the sandbox was supplied as a resolver. Every workspace tool avoids this by
going through `resolveEffectiveWorkspace`, which calls `workspace.resolveSandbox`
and returns a proxy; code mode never calls it. So the sandbox half is *not*
fine, and is the second reason the `execute` override cannot be deleted.

### 3.3 Generated instructions ignore `config.id`

Filed as [#21885](https://github.com/mastra-ai/mastra/issues/21885).

`USAGE_CONTRACT` is a module constant naming the tool `execute_typescript`, and
`createCodeModeInstructions` never reads `config.id`. A tool created with
`id: 'slack'` is described to the model as `execute_typescript`, so
`src/mastra/prompts/features/code-mode.ts` has to run
`instructions.replaceAll('execute_typescript', 'slack')`. The same string also
hardcodes "Do not rely on filesystem, network, or process access", which is
wrong once code mode holds workspace file tools, forcing the `<files>` section
to explicitly override it.

## 4. Channels

### 4.1 `ChannelContext` has no memory thread id

`ChannelContext` (`@mastra/core/channels`) carries platform ids only: `threadId`,
`channelId`, `messageId`, `userId`. Nothing maps back to the memory thread the
run is actually writing to.

So `src/mastra/lib/memory.ts` reverse-looks-up the memory thread on every call:

```ts
memory.listThreads({ filter: { metadata: { channel_externalThreadId } }, perPage: 1 })
```

and throws a user-facing "Send another message and try again" when the thread
does not exist yet. Everything that needs a memory scope depends on this:
`tools/wait.ts`, `tools/scheduled-tasks/create.ts`, and `chat/commands/stop.ts`.
The metadata key `channel_externalThreadId` is an undocumented internal.

Native fix: put `memoryThreadId` and `resourceId` on `ChannelContext`.

### 4.2 `ChannelContext`'s required fields are not guaranteed (WITHDRAWN, not an upstream issue)

Original claim: `platform`, `eventType` and `userId` are declared required but
absent on some runs, forcing the `Partial<>` re-type in
`src/mastra/types/channel.ts`.

That is wrong. `buildEventContext` in `@mastra/core` populates all three
unconditionally on every path that sets the `channel` key. The real situation is
that the whole `channel` key is absent when an agent is invoked outside channels
(`summarizer.generate()` from `summarize_thread`, and the `research` / `explore`
sub-agents). `channelContext()` returning `{}` covers that, and the `Partial<>`
is our own defensive typing, not an upstream defect.

Nothing to file.

### 4.3 Slack assistant status is not cleared when a turn posts nothing

Channels owns the typing-status lifecycle, but Slack only auto-clears the status
on a posted message, not when streaming stops. A turn that ends without posting,
for example right after the `wait` tool, leaves a stale "is waiting..." pinned to
the thread. `src/mastra/processors/clear-status.ts` is an output processor that
exists purely to call `setAssistantStatus(channel, threadTs, '')`.

Native fix: clear the status on turn end in the channels adapter. Upstream's
`withTypingStatus` docblock already documents the Slack auto-clear semantics and
mitigates the streaming case via `typingGate`; the uncovered case is a run that
ends without posting at all.

Filed upstream: [mastra-ai/mastra#21880](https://github.com/mastra-ai/mastra/issues/21880).

### 4.4 Typing status cannot reuse a tool's declared display transform

`TypingStatusFn` receives the raw chunk and a context, not the tool's
`transform.display` output. Tools already declare display metadata for the
`input-available` phase, but the typing status cannot read it.

Result: `src/mastra/chat/status/statuses.ts` is a 185-line lookup table keyed by
tool name, hand-maintained in parallel with the tool definitions, drifting from
them, and structurally unable to cover MCP or otherwise dynamically registered
tools. `TODO.md` still lists one known hole: code-mode `slack` shows a flat "is
working in Slack...", and `execute_command` shows the raw shell command, since
a wrapper adding a model-authored title was reverted as not worth a duplicate
visible tool.

Native fix: let a tool declare its in-progress label next to its other display
transforms, and have `defaultTypingStatus` use it.

### 4.5 Delegated sub-agent tool chunks collide

Tool chunks emitted by a delegated sub-agent carry the child's own `toolCallId`
and `toolName`, so distinct cards merge in the transcript.
`src/mastra/processors/delegated-tools.ts` re-namespaces them to
`parentId::childId` and `parentTool_childTool`.

The rename then has to be undone for display:
`src/mastra/chat/status/index.ts:17-26` parses the `agent-<id>_<childTool>`
prefix back apart against a hardcoded `delegationAgentIds` set, because matching
on `agent-` alone would render a child's tool call identically to the spawn call.

Native fix: namespace delegated tool ids at the source and expose the parent
and child names as structured fields rather than a joined string.

### 4.6 Native Slack streaming drops tool cards on scheduled wakes

Slack's native streaming needs `recipient_user_id` / `recipient_team_id` outside
a DM. A scheduled run wakes an idle thread with no live message, so Chat SDK has
nothing to supply, and tool cards get dropped.

`src/mastra/chat/adapter.ts` subclasses `SlackAdapter` to intercept
`handleMessageEvent`, remember the last recipient per thread in Postgres via the
state adapter (with an in-memory 10k-entry LRU to throttle writes), and inject it
back in an overridden `stream()`.

Native fix: persist the recipient per thread in the Slack adapter itself, since
it already sees every message event.

Wrong repo for this list: `SlackAdapter` ships in `@chat-adapter/slack`, which is
[`vercel/chat`](https://github.com/vercel/chat), not Mastra. File there if at all.

### 4.7 Mid-thread mention on a subscribed thread skips history backfill

`src/mastra/chat/handlers.ts:118-121` calls `thread.unsubscribe()` before running
a one-off mid-thread mention, purely to force history backfill on a thread
Mastra has already marked subscribed. Unsubscribing as a way to request a
backfill is a side effect, not an API.

Native fix: an explicit "backfill history for this turn" option on the handler
or on `threadContext`.

## 5. Models and providers

### 5.1 No signal for which fallback model actually answered

With a `ModelWithRetries[]` fallback array, every turn rediscovers from scratch
that the primary is rate-limited, paying the full retry ladder each time.

Two pieces of this repo exist only to work around that:
`src/mastra/processors/working-model.ts` reads
`result.steps.at(-1)?.response?.modelId` in `processOutputResult` and persists it
with a 30 minute TTL, and `preferLastWorking()` in `src/mastra/providers.ts`
reorders the fallback array so the last known-good model is tried first.

The processor also carries a note that `processOutputStep` cannot be used here:
it runs before the finished step is appended to `steps`, so it sees only prior
steps and nothing at all on a single-step turn.

Native fix: track per-model health in the fallback resolver, with a configurable
cooldown, and prefer the healthy model without the caller reordering the array.

Caveat found while auditing: `chat().getState()` resolves to
`MastraStateAdapter`, whose `get`/`set` are an in-process `Map`, so the
working-model cache does not survive a restart and is not shared between
instances. The 30 minute TTL is bounded by process lifetime.

### 5.3 Fallback models never advance on a mid-stream error

Filed as [#21876](https://github.com/mastra-ai/mastra/issues/21876).

`executeStreamWithFallbackModels` advances the model index only in its `catch`,
so an error delivered as an in-band stream chunk (the callback returns normally
with `hasErrored` set) marks the loop done and skips every remaining model. The
in-place retry path does not cover it either: once `canRetryError` is false
there is no branch that moves to the next model. This is what the
`advanceFallbackModel` hunk in our patch adds.

### 5.2 Tool-result images are not provider-portable

Providers reject media inside tool results. `src/mastra/processors/tool-media.ts`
is a `ProviderHistoryCompat` `CompatRule` (`moveToolImages`) that strips image
parts out of tool results, leaves a text stub behind, and re-attaches them as a
following user message.

It is registered on both `orchestrator` and `explore` via
`new ProviderHistoryCompat({ additionalRules: [moveToolImages] })`.

Native fix: ship this as a built-in `ProviderHistoryCompat` rule. It is a generic
provider-compat concern, not an application concern.

## 6. Schedules

### 6.1 No one-shot schedule

`schedules` is cron-only (`ScheduleTriggerInfo.kind` is `'cron' | 'manual'`).
The `wait` tool needs a single delayed wake-up, so
`src/mastra/tools/wait.ts:52-58` synthesizes a one-shot from a `Date`:

```ts
const cron = `${s} ${m} ${h} ${date} ${month} *`
```

which still repeats annually. Three more pieces exist to contain that: an
explicit guard for `getUTCFullYear() > 9999`, a `metadata: { kind: 'wait' }` tag
plus a sweep of already-fired wait rows at the top of every `execute`, and a
`schedules.prepare` hook in `src/mastra/index.ts:39-46` that deletes any `wait`
schedule as it fires.

Native fix: a `runAt: Date` one-shot schedule that deletes itself after firing.

## 7. MCP

### 7.1 No per-user or dynamic server support in `MCPClient`

`MCPClient` takes a static server map at construction. Gorkie lets each user
register their own servers from App Home, so `src/mastra/mcp/user-servers.ts`
hand-rolls the whole dynamic layer: a per-user client cache keyed on
`JSON.stringify(servers)`, disconnect of the stale client on config change,
eviction of a rejected build promise so a failure does not poison the cache
forever, and `dropClient` when a user removes their last server.

Native fix: a keyed client registry, or `servers` accepted as a function of the
request context.

### 7.2 Connection errors require a throwaway probe client

There is no "can I reach this server" call, so
`findMCPConnectionError()` constructs an entire second `MCPClient`, calls
`listToolsWithErrors()`, and disconnects it, just to validate a URL and token at
registration time.

Native fix: a `probe`/`testConnection` method on `MCPClient`.

### 7.3 `listToolsWithErrors` returns unusable error strings

`src/mastra/mcp/errors.ts` exists to make those errors showable to a user. Each
one arrives as either a raw string or a JSON-encoded `{ message }`, with a stack
trace appended after the first line, and prefixed with
`Failed to connect to MCP server <name>: ` even though the caller already knows
the server name. The helper unwraps the JSON, keeps line one, strips the prefix,
and truncates to 300 characters.

Native fix: return a structured error (code, message, cause) instead of a
pre-formatted string with a stack trace in it.
