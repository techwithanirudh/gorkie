# Issues

Findings from reading 4337 production traces (2026-08-13 to 2026-09-12, 13 GB)
pulled from Mastra Platform, cross-referenced against the GitHub issue tracker.
Written 2026-09-12.

Severity is what the user experienced: **breaks** means the turn died,
**degrades** means it completed with a worse answer, **cosmetic** means latency
or log noise only.

## How the corpus breaks down

4337 traces, of which 2287 carry a Slack thread id and 2043 are standalone
processor or background runs. 769 distinct Slack threads. Only **141 traces
carry any error at all**, and most of that is infrastructure rather than code:

| count | error | verdict |
| ----- | ----- | ------- |
| 81 | Insufficient credits (OpenRouter) | billing |
| 27 | Internal server error | provider |
| 19 | Model `ox-alpha-free` is not supported | see A3 |
| 16 | Too Many Requests | provider |
| 11 | Service Unavailable | provider |

Stripping those leaves 20 traces holding real defects, below.

## A. Application defects found in traces

### A1. A 1.3 MB screenshot read with `read_file` blows the context window

**Breaks the turn. Live in this tree.**

Traces `8a472b2fe83921b89283883dd8a1a341`,
`1e089aa8eca6f947e8848b7d0912c830`, `4ba7eceae7f72507745c09b9ba9465a5`: the
same thread, three consecutive attempts, 1,245,113 / 1,245,166 / 1,245,281
tokens against a 1,048,576 window. All three 400'd.

A 1,293,665 byte PNG becomes ~1,724,900 base64 characters and the gateway
tokenizes it as text. Four things line up to let it through:

1. `src/mastra/prompts/tools.ts:34` tells the model to read images by calling
   `read_file` with only the path, so this route is prescribed.
2. `src/mastra/workspace/index.ts:98` sets no `maxMediaBytes`, so Mastra's
   default of 10 MB applies and the image is inlined whole.
3. `TokenLimiterProcessor` cannot see it. `estimateMediaTokens` returns a flat
   `TOKENS_PER_IMAGE = 765` for anything `image/*`, a 1600x undercount, so the
   limiter trims nothing.
4. `moveToolImages` (`src/mastra/processors/tool-media.ts:18-77`) then lifts
   the base64 into a user `file` part, and it runs at
   `src/mastra/agents/orchestrator.ts:123`, after the limiter at `:119`. Even a
   correct limiter would be bypassed.

Fix: set `maxMediaBytes` on the `read_file` entry at
`src/mastra/workspace/index.ts:98`. Over the cap Mastra already returns a
metadata string naming the limit instead of the bytes, so the model is told
rather than the turn dying. Also move the media relocation before the limiter.

### A2. A text-only model is handed an image

**Breaks the turn. Live, and the risk has moved.**

Traces `0c004474e5b36ebdd120d38cb85ca703`,
`85497ac2a46a51bdc8508b69483c920c`, `23a172808c69acf07c10247cc9b3270f`: one
thread, three attempts in 90 seconds, all dead. The user attached a screenshot
and got nothing.

This confirms the open item in `TODO.md` about image handling. The turn first
tried `openai/gpt-5.6-luna`, which failed for an unrelated reason, then fell
through to `opencode-go/deepseek-v4-flash`, which rejected the image.

Two of that item's three claims are confirmed: nothing checks vision capability
before sending a file part, and `provider-registry.json` lists the opencode-go
models as a bare string array with no capability metadata, carrying both
`deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` with nothing to tell
them apart. The third claim, that `preferLastWorking` can pin a turn to a
text-only route, is plausible but not provable from these traces: it emits no
span. What the traces do show is fallback ordering causing the same damage.

The correction: the exact model in these traces is no longer configured.
`src/mastra/providers.ts:62-73` now starts the chain with
`opencode-go/glm-5.3-flash`, whose vision capability is equally unverifiable
from the registry. An image turn today hits that before it ever reaches the
`-vision-exp` entry.

Fix: have the chain take the turn's modality and filter. A hardcoded vision set
next to the chain is honest given the registry carries nothing.

### A3. `ox-alpha-free` is not a real model

**Broke turns, caused 34 minute runs. Fixed on `github-setup`, live on `main`.**

Traces `68f9423dcacbc8c30e2633fedc5a735f`,
`82527692c635372b23ddf2796e617903`, `61cc3efaab679398e715986827b47724`,
`f213138f374bcf9ad938a98dae09df17`. This is GitHub issue 34.

The model does not exist on the OpenCode Go endpoint, and the gateway does not
answer with a clean 404. It returns whatever its upstream router produces:
`[1210] Invalid API parameter`, `[1261] Prompt exceeds max length`, "Content
Exists Risk". In `61cc3ef` that repeated 52 times across 34 minutes.

`src/mastra/providers.ts` on this branch no longer lists it;
`origin/main` still carries it in all three chains.

A second defect made it expensive. The terminal-error pattern in
`src/mastra/lib/error-handling.ts:20` catches `is not supported` but not
`[1210]` or `[1261]`, so those fall to the catch-all retry and burn two
attempts per step on errors no retry can fix.

### A4. `read_file` prepends a header and silently truncates, and code mode JSON-parses it

**Degrades silently. Live in this tree.**

Trace `8627dcb7e9b14cd5621a68e33fa5c525` carries both JSON errors. The agent
wrote `JSON.parse(await external_read_file(...))` and got
`Unexpected token '/', "/home/user"...`, diagnosed the header, stripped it,
retried, and then got `Bad control character in string literal at position
6206`.

Two causes. Mastra's `read_file` always prepends a `path (N bytes)` header and
`showLineNumbers: false` does not suppress it. And
`src/mastra/workspace/index.ts:98` sets no `maxOutputTokens`, so the default of
2000 applies: a 2,455,190 byte file came back as ~6.2 KB with the cut landing
inside a JSON string literal.

`src/mastra/prompts/features/code-mode.ts:10` actively steers into this, telling
the model it can write a JSON export and read it back later. That round trip is
broken today for any file over ~6 KB.

Fix: set an explicit `maxOutputTokens`, and document in the code-mode prompt
that `external_read_file` returns a header plus possibly-truncated content and
must never be `JSON.parse`d. Structured data should be read in the sandbox with
`node:fs/promises`, which that prompt already documents as the escape hatch.

### A5. The Slack search token expires mid-turn, and the failure multiplies

**Degrades. Live in this tree.**

Traces `bee3fb459e9bd5b79a75a19f6335b2ee`,
`39f0d37a55a7b4fc4d89f4dc28560605`, `b418c7bb48e4b0d4362415937190ac03`,
`716d7e2d157e42d244055e3642f07b8a`.

Slack's `action_token` lives about two minutes. `captureSearchToken`
(`src/mastra/chat/handlers.ts:19-31`) stores the bare string with no capture
time, and `src/mastra/tools/slack/search-slack.ts:113-118` treats presence as
validity. So any search issued more than two minutes after the mention fails,
and delegation to `research` necessarily happens later in the turn, making
delegated search structurally the most likely to expire.

In `bee3fb459` one code-mode program fired fifteen `search_slack` calls over
four minutes and every one came back expired: nothing told call 2 that call 1
had already proven the token dead.

Fix: store a capture timestamp alongside the token and treat anything older
than ~110 seconds as absent, which takes the existing "no fresh token" branch
that already tells the model what to do. Memoize the expiry per request context
so a fan-out fails once.

### A6. `read_canvas` had a false-positive guard, and now has no guard

**Was degrading, now a permissions hole. Shape changed.**

Trace `d8620f5e0c1f7e78cf3a03d9deb961e6`: `external_read_canvas` refused canvas
`F0BSTBWRCBU` as belonging to "another private conversation", while a parallel
`get_channel_info` on `C0BSTBWRCBU` succeeded in the same program. Note the
suffixes: the refused canvas is the channel canvas of the channel the
conversation was in. A canvas id can never equal a channel id, so a guard built
on that comparison rejects every canvas including the current one.

That exact error string exists in no commit on any ref in this repo, so the
deployed bot is not this working tree. Two other signs agree: a stack trace
pointing at `/root/gorkie/.mastra/output/`, and traces running a model that
appears in no ref at that date.

`src/mastra/tools/canvas/read.ts:27-47` at HEAD has **no visibility guard at
all** and will read a canvas from any private conversation the bot has been in.
The false positive is gone and a hole is in its place. Worth a decision.

### A7. Not a gorkie bug: OpenPGP in the sandbox

**Cosmetic.** Trace `4c326f42a19301aa3a831913ff452031`. There is no OpenPGP
dependency anywhere in gorkie. The user asked whether code mode could PGP
encrypt, the agent `npm install`ed `openpgp` inside the E2B sandbox and imported
it by absolute path into `dist/openpgp.mjs`, which resolved to a string rather
than the module. `getPrimarySelfSignature is not a function` is the symptom. The
agent spent eight minutes debugging its own throwaway code and reported the
failure honestly.

Worth one line in the code-mode prompt: import sandbox-installed packages by
bare specifier, not by absolute path into `dist/`.

### A8. Not a bug: transport errors

**Cosmetic.** `94b4bcd3ff7d29fcacc046771f8d2f4e`,
`fb428949e7fafbc8e080b4cc4d2e96a8`, `120d6c3b1056579510b7550a5d9e299a`. All
three surface only on retry-processor spans, all three root runs finished with
`finishReason: 'stop'`. The retry policy handled them correctly. They are
distinguishable from real failures by the root span carrying no error.

### A9. `glm-5.3-flash` replies with raw `<annotation>` markup

**Breaks the turn. Live, and this model is now first in the fallback chain.**

Trace `6566dcdebfd3411901a830c0325a51a2`. The user said "there". The entire
reply was:

```
<annotation>Respond to latest message</annotation><annotation>Respond to latest message</annotation>
```

Two inference steps on `opencode-go/glm-5.3-flash`, the first finishing
`other` and the second `stop`, each emitting that tag and no tool calls. The
run completed successfully as far as every span is concerned.

The string "Respond to latest message" appears nowhere in `src/`, nowhere in
`@mastra/core`, and in no prompt. The model is emitting its own internal
scaffolding as visible output.

This is the same class as the reopened issue 4, where `<think>` blocks leaked
into Slack, and it has the same cause: an inline-reasoning model on an
unwrapped transport with no output guard. `grep -rn "extractReasoning\|wrapLanguageModel" src/`
still returns nothing. A guard that strips model-internal tags before the
render processor would cover both, and `glm-5.3-flash` being first in the
chain at `src/mastra/providers.ts:62-73` makes it the common path, not an edge
case.

## E. The silent-failure class: turns that never reach Slack

Investigated against the thread linked from issue 35
(`D0BGJGU5108:1789170614.666169`).

**The linked trace is not the failure.** `2e7ec2bacc767b725194d64ed0512ffe` is
a clean, complete, delivered turn: 19 spans, `finishReason: stop`, the render
processor handled all 165 chunks. **The turn that actually stopped has no
trace at all.**

Verified 2026-09-12 against a freshly synced index of all 4374 runs, not the
downloaded corpus:

| time (UTC) | event |
| ---------- | ----- |
| 09-11 23:56:25 | last run in this thread starts |
| 09-11 **23:57:04** | that run **ends cleanly**, 39 seconds, `status: success` |
| 09-11 23:57:44 | a new run begins posting to Slack |
| 09-11 23:57 to **09-12 00:22:40** | **44 Slack messages** over 25 minutes, sandbox work, wrangler deploys |
| | then nothing, for **7 hours 1 minute** |
| 09-12 07:23:49 | the user asks "what hPpene d" |

**No trace exists for any of those 25 minutes.** The index holds nothing
between 23:57:04 and the next run at 02:10:49, which belongs to a different
user. So the run was alive, productive, and posting to Slack for 25 minutes,
then stopped dead without completing, without raising an error, and without
exporting anything.

The reason it is undebuggable is structural: **the platform trace list only
returns traces whose root span completed.** A run that never finishes never
exports, so it is absent from the UI, absent from the API, and absent from any
download. That is issue 31.

Two corrections to an earlier reading of this incident. The last activity was
**00:22:40, not 00:01:52**, so the run worked for 25 minutes rather than
stalling almost immediately. And the replies **did** reach Slack during that
window, so "the reply never reaches Slack" is the wrong description of this
particular failure: the run stopped mid-work after delivering plenty.

Ruled out: a host restart. The corpus-wide gap around the incident is 134
minutes, and the corpus contains ten overnight gaps between 357 and 689
minutes, so a quiet stretch at midnight UTC is ordinary traffic, not an outage.

### This means `TODO.md` conflates two different bugs

The TODO describes a turn that finishes with `finishReason: 'stop'` and real
usage but never posts. Issue 31 describes a hang with no reply and no trace.
They are not the same, and fixing one will not fix the other.

Counts across 2367 root agent runs:

| class | rule | count |
| ----- | ---- | ----- |
| hang, no trace | user message referenced in later history but no trace exists | 18 genuinely dropped in DMs |
| run threw, nothing posted | root `agent_run.output === null` | 58 |
| clean finish, no render span | no `chat-channel-render` for that run | 162 of 2367 (6.8%) |
| clean finish, zero text in a DM | silence is only sanctioned in channels | 3 |

The discriminating signal for the third class: runs whose `requestContext`
lacks `__mastra_chat_channel_render`, which is the `wait`-resume and
scheduled-task wake path, are unrendered **56% of the time (15 of 27)** versus
**3.8% (86 of 2277)** for normal inbound turns.

### Likely causes, in order

1. **No execution time budget on any agent.** `src/mastra/agents/orchestrator.ts:96-101`,
   `research.ts:54-58` and `explore.ts:53-58` set `maxOutputTokens`, `maxRetries`,
   `topP` and `reasoning`, and no `timeout`. Mastra documents
   `timeout.{totalMs,stepMs,firstChunkMs}` and states that without it no time
   limit applies, and that `stepMs` "covers both establishing the stream and
   consuming it, so a provider that opens a stream and then stalls is also
   caught", advancing to the next fallback on timeout. Without it a stalled
   provider emits no error, so neither `maxRetries: 5` nor the four-model
   ladder ever engages. With `maxSteps: 1000` (`src/mastra/config.ts:10`) the
   run has no upper bound at all.
2. **Unbounded Exa calls.** `src/mastra/tools/fetch-url.ts:31-37` and
   `src/mastra/tools/search-web.ts:35-40` call Exa with no timeout and no
   `AbortSignal`. Issue 31 names `fetch_url`; `search_web` has the same shape.
3. **The wake path can resolve no render target.** Mastra's
   `resolveRenderContext` takes a fast path from
   `requestContext.__mastra_chat_channel_render`, else rebuilds from the
   thread, else passes through untouched with no post and no error.
   `src/mastra/tools/wait.ts:69-73` hands the wake path a serialized context
   that arrives without the render key. This is the same defect as the
   "streaming breaks on scheduled task tools" item and issue 35's "scheduled
   task is broken". Unproven for current code: there are no wake-path runs in
   the corpus after 2026-09-09, so the channels upgrade may have changed it.
4. **Every Slack write in the render driver fails silently.** Five separate
   sites in Mastra's render driver log at `warn`/`debug`/`error` and swallow,
   including a `driverPromise.catch(() => {})`. With `toolDisplay: 'hidden'`
   (`orchestrator.ts:191`) that path runs at every tool call. No trace-visible
   instance was found, so this is a surface rather than a proven cause.
5. **A thrown run says nothing.** `formatError` (`orchestrator.ts:193-194`)
   renders `error` chunks through the driver, but an exception escaping the run
   bypasses it entirely.

### Issue 30 is not the same bug

No evidence links observational memory to either failure. Its `memory: observe`
spans run detached from the input processor that spawns them, so they do not
block a step. Issue 30 is real but is an efficiency problem, sharing only the
environment (no time budget, `maxSteps: 1000`) with the hang.

## B. Trace size

**13.03 GB over 31 days, 0.42 GB/day.** Median trace 909 KB, p99 48.9 MB,
largest 248 MB. The top 60 traces are 1.4% of the count and **34% of the
bytes**.

The cause is duplication, not history growth. **66% of spans in the largest
traces carry a full copy of `input.messages`**, averaging 424 copies per trace.
Multiplication factor, stored bytes over unique content:

| field | top 30 | corpus |
| ----- | ------ | ------ |
| `input.messages` | x20.2 | x9.0 |
| `input.systemMessages` | x91.3 | x7.6 |
| `input.tools` | x150.4 | x12.7 |
| whole trace | x6.26 | x2.98 |

`processor_run` spans are **73% of all bytes** corpus-wide and are 98.5%
`input`. The worst are `tool-search`, `token-limiter`, `chat-channel-context`,
`skills-processor`, `workspace-instructions-processor` and
`observational-memory`, each re-serializing the whole conversation. The `llm:`
spans are only 1.2%.

A second offender: **`requestContext` is 16.4% of the corpus** and is pure
accident. `requestContext.__mastra_chat_channel_render` serializes the live
Slack `WebClient` and adapter as ~130 KB of `"[Function]"` strings per span,
with `chatThread._adapter` alone being a back-reference to the whole adapter.
Zero diagnostic value.

This is a runtime cost, not just storage: `deepClean` deep-copies the payload,
so a single Slack reply can deep-copy and re-serialize 237 MB on the host while
the user waits.

**`includeInternalSpans: false` is the wrong lever and saves nothing.** It
already defaults to false, and `PROCESSOR_RUN` is never classified as internal,
so the flag can never drop it.

The lever is `customSpanFormatter`, which `BaseExporter` applies before export.
Dropping the entire `input` on `processor_run` spans plus `requestContext`
saves **86.2%**, taking 13.03 GB to 1.80 GB and the 237 MB trace to ~16 MB,
while keeping every span and its timing. Preferred over excluding processor
spans entirely, which buys 3.5 points more but destroys the retry-loop evidence
that explains the giant traces in the first place.

A giant trace is a long sandbox coding session plus a reasoning model plus
provider errors driving retry loops: median 602 spans and 664 seconds against
18 spans and 8 seconds for a median trace, and 11 of the top 30 carry errors
against 0 of 40 median ones. Delegation is not a driver.

## C. GitHub issues

| # | state | title | trace evidence |
| - | ----- | ----- | -------------- |
| 35 | open | two issues (sandbox parity, background tasks, tool display, scheduled tasks, upload fallback) | comment links a thread that stopped midway, trace `2e7ec2bacc767b725194d64ed0512ffe` |
| 34 | open | stale opencode model ids break fallback recovery | A3, confirmed in 4 traces |
| 31 | open | agent turn hangs with no reply and no trace when a tool call stalls | under investigation |
| 30 | open | observational memory does not buffer during long active agent runs | related to B, that processor is a top-6 byte offender |
| 25 | open | Implement thread-scoped GitHub task handoff | no trace evidence |
| 23 | open | add per-user limiting | no trace evidence |
| 6 | open | Hello from gorkie dev | not a defect |
| 4 | closed | Orchestrator emits raw `<think>` blocks | reopened in `TODO.md`: the guard was removed a third time and no longer exists in `src/` |

## D. Two cheap fixes that cut across several of these

1. Set `maxMediaBytes` and `maxOutputTokens` on the single `read_file` entry at
   `src/mastra/workspace/index.ts:98`. That addresses A1 and A4.
2. Widen the terminal-error pattern at `src/mastra/lib/error-handling.ts:20` to
   include prompt-too-long, invalid-parameter and text-only-model refusals.
   That stops A2 and A3 burning retries on errors no retry can fix.

## F. Known limits of the trace viewer

- **Private channels show as raw ids.** The bot token resolves public channels
  and users, but `conversations.info` returns `channel_not_found` for private
  ones (`C0B9M2S2LSU`, `C0A3B4HV28Z`, `C0BSJB44668` and others), and the
  traces do not carry the name anywhere either. Fixing it means adding
  `groups:read` to the Slack app scopes, which is a Slack app config change,
  not a code one. DMs hit the same wall (`im:read`) and are worked around by
  naming them after the participant recorded in the trace.
- **The viewer reads downloaded files, not the API.** Warm start is 0.08s
  against 3 to 30 seconds per trace live. The cost is staleness.
- **A hung run can never appear.** The platform trace list only returns traces
  whose root span completed, so the failure class in section E is structurally
  absent from any download.

## G. The watchdog kills turns, and trace bloat is why

Diagnosed 2026-09-12 by reading the production host directly. This is the root
cause of section E and it is not a hang.

### The sequence

```
23:57:49  [chat] turn started                          (pid 476413)
00:02:59  gorkie-monitor.service runs
00:03:07  "health check failed (2/2)" -> systemctl restart gorkie.service
          90 seconds pass. The app logs nothing. It never handles SIGTERM.
00:04:37  systemd: "State 'stop-sigterm' timed out. Killing."  SIGKILL
00:04:38  service restarts, online 00:04:45
00:05-00:30  zero turns started. The thread gets no reply.
07:23:49  the user asks "what hPpene d"
```

`/usr/local/bin/gorkie-monitor.sh` curls `127.0.0.1:4111` with `--max-time 8`
and restarts the service after two consecutive misses. The turn was five
minutes into sandbox-heavy work, the event loop stopped answering inside that
8 second budget, and the watchdog shot it.

That single fact explains every symptom at once. **No trace**, because the
exporter buffers spans in memory and SIGKILL never flushes. **No error**,
because SIGKILL cannot report. **No reply**, because the turn died mid-flight.
**No resume**, because the restarted process has no record that a turn was
running.

### This is routine, not exceptional

**406 watchdog restarts since 2026-08-13**, twelve of them in the four days to
09-12. Every one destroys whatever turns were in flight and loses their traces.

The host has **1966 MB of RAM with 1365 MB already in swap**. gorkie alone
holds about 1 GB RSS, half the machine. systemd recorded `1G memory peak, 1G
memory swap peak` for the killed unit. The monitor script's own comment says
it was written after an Aug 17 outage where the process wedged
"swap-thrashing under memory pressure", so the watchdog was always treating a
symptom.

### Why the trace payloads are the memory

`deepClean` runs in the **span constructor**, not at export
(`node_modules/@mastra/observability/dist/index.js:2897-2900`):

```js
this.attributes = deepClean(options.attributes, this.deepCleanOptions) || {};
if (options.requestContext && options.requestContext.size() > 0)
  this.requestContext = deepClean(options.requestContext, this.deepCleanOptions);
if (this.isEvent) this.output = deepClean(this.prepareSpanOutput(options.output), this.deepCleanOptions);
else this.input = deepClean(options.input, this.deepCleanOptions);
```

So the moment a processor span is created, the whole `input` (the full message
array) is deep-copied and then **held on the span object for the lifetime of
the span**. With 66.6% of spans being `processor_run`, each re-serializing the
conversation, a long turn allocates and retains hundreds of copies. That is
synchronous work on the event loop and resident memory that cannot be
collected until the trace ends.

### The correction: `customSpanFormatter` does not fix this

Earlier notes in this file recommended `customSpanFormatter` over
`excludeSpanTypes`, on the reasoning that it keeps the spans and drops only
the payload. **For storage and bandwidth that is right. For memory it is
wrong, and memory is what kills the bot.**

`customSpanFormatter` is applied in `BaseExporter.exportTracingEvent`
(`index.js:4488-4526`), which runs at **export** time. By then the constructor
has already deep-copied the payload and the span has been holding it for the
whole turn. The formatter shrinks what leaves the process; it cannot unspend
the allocation.

`excludeSpanTypes` is checked in the constructor and short-circuits before any
of it (`index.js:2875, 2894-2896`):

```js
this.isExcluded = this.alwaysExcluded
  || observabilityConfig.excludeSpanTypes?.includes(this.type) === true
  || this.isInternal && !observabilityConfig.includeInternalSpans;
...
if (this.isExcluded) {
  this.attributes = {};
  return;                 // never reaches the deepClean calls below
}
```

Mastra's own doc comment on `isExcluded` states the intent plainly: skipping
"avoids both the deepClean cost and holding references to large payloads for
the lifetime of the span."

### The fix

```ts
import { SpanType } from '@mastra/core/observability';

new Observability({
  configs: {
    default: {
      serviceName: 'orchestrator',
      excludeSpanTypes: [SpanType.PROCESSOR_RUN],
      exporters: [ ... ],
    },
  },
})
```

`SpanType.PROCESSOR_RUN` is the string `processor_run`. Measured against this
corpus it removes **66.6% of spans**, which is both the memory and the billed
event count (126k/month becomes ~42k). The price is losing per-processor
latency data and the `stream-error-retry-processor` evidence that helped
explain the giant traces.

Two things this does **not** fix, which need their own work:

1. **No SIGTERM handler.** systemd allows 90 seconds (`TimeoutStopUSec=1min
   30s`, `KillSignal=15`) and the app used none of it. That window is enough
   to flush the observability exporter, so the trace survives, and to post
   "restarting, your turn was interrupted" into in-flight threads. This alone
   converts a silent seven hour void into a visible message.
2. **The health check lies.** `--max-time 8` against a process doing
   legitimate heavy work is a false positive generator. A dedicated health
   route answered off the hot path, or a longer timeout with a higher
   threshold, would stop the watchdog firing on healthy long turns.

Also note: adding `timeout` to the agents, recommended earlier as the fix for
section E, would **not** have prevented this incident. It guards a stalled
provider, not SIGKILL from a watchdog. It remains worth doing for the class of
hang it does cover.

### Applied in production 2026-09-12

Three changes on the host, all reversible, none requiring a restart:

- `systemctl set-property gorkie.service MemoryHigh=1400M` (was `1G`).
  `MemoryCurrent` was `1073340416`, sitting exactly on the old 1 GB line, so
  the kernel was continuously reclaiming the unit's pages into swap. That
  forced reclaim, not a shortage of swap, is what produced the 9 million major
  page faults. Swap itself was never the constraint: 5886 MB total with 4499 MB
  free, so adding swap would only have widened the target for eviction.
- `THRESHOLD=2` to `5` in `/usr/local/bin/gorkie-monitor.sh`, taking the grace
  window from about 2 minutes to about 5. 487 stalls recovered on their own
  against 406 that escalated, so over half of all restarts were killing a
  process that was going to come back by itself.
- `--max-time 8` to `20` in the same script. 8 seconds is inside normal noise
  on a box whose I/O pressure sat at 43%.

Backups: `/root/memory.conf.bak.20260912`,
`/root/gorkie-monitor.sh.bak.20260912`.

Measured immediately after: `/proc/pressure/io` went from `full avg10=42.81`
to `full avg10=0.38`, with `avg60=17.63` and `avg300=37.08` showing the decay
from the old state. Resident swap stays at ~1344 MB because pages already
evicted are only faulted back when touched; what stopped is new eviction.

Still outstanding: the SIGTERM handler, deploying `excludeSpanTypes`, and
heartbeat-based stall detection. Note also that the 406 restarts are not
evenly spread: 342 of them fall on 2026-09-08 and 09, a crash loop restarting
every two minutes, which is a different failure from the healthy-but-stalled
case. The steady state is one to four a day.

### Second confirmed instance: the 9709 study-PDF thread

2026-09-07, Slack thread `C0A6C5F52BE:1788772979.535359`. Same signature, so
this is a pattern rather than a one-off.

```
09:24:06Z (14:54 IST)  [chat] turn started, "download all the PDFs"
09:27:03Z              health check failed (1/2)
09:28:03Z              health check failed (2/2) -> restart
09:29:33Z              "final-sigterm timed out. Killing." -> SIGKILL
09:29:33Z              service restarted
...70 minutes of nothing while the user waits and complains...
10:36:59Z (16:06 IST)  a NEW turn runs for 113s and delivers the zip
```

The turn was killed five and a half minutes in, and left no trace. Its last
words before the SIGKILL were the 2:56 PM note about switching to a
dependency-free extractor. The user waited an hour, prompted again, and a
fresh turn did the work in under two minutes.

This also explains the apology in that thread. The restarted process reported
"done in 1 minute 50 seconds" because from its point of view that is all the
work took. It had no record that an earlier attempt had ever run.

One difference from the 09-11 incident: this one reports `final-sigterm`
rather than `stop-sigterm`, so it survived the main stop phase and hung in
final cleanup. Same missing SIGTERM handler, same outcome.
