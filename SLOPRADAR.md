# Slopradar

<!-- cspell:ignore nodesource mmdc picsum GSAP -->

Pass 2, 2026-10-01, branch `chore/quality-pass` (head `8ae467af` plus the uncommitted working tree at annotation time).

Pass 1 (2026-09-24): 244 annotations across seven scopes, resolved, verified and logged in `IMPLEMENTED.md` under 2026-09-24; its leftovers are the "Slopradar leftovers from verification" item in `TODO.md`.

Rules measured against: `AGENTS.md`, `CODING_STANDARDS.md`, and the `code-review-and-quality`, `code-simplification`, `coding-best-practices` and `unslop` skills. Six reviewers annotated every line in their scope with `TODO(slopradar)` comments and changed no code. This file compiles their reports. Owner questions are in `TODO.md` under "Owner decisions from slopradar (pass 2, 2026-10-01)"; resolve those first, then the bands below, logging each resolution in `IMPLEMENTED.md`.

## Scores

Slop is 0 to 10, 10 worst. Counts are from `grep -rn "TODO(slopradar)" src scripts workspace docs drizzle README.md AGENTS.md CODING_STANDARDS.md .env.example drizzle.config.ts`, which returns 200 and matches the reviewers' counts. Two pairs of identical comment texts (mermaid dash notes) sit in different files, so nothing was annotated twice.

| Scope | Slop | Annotations |
| --- | --- | --- |
| `src/mastra/chat/**` | 3 | 34 |
| `src/mastra/tools/**` | 3 | 34 |
| `src/mastra/{lib,db,server,observability}/**`, `drizzle/**` | 2 | 21 |
| `src/mastra/{mcp,workspace,processors}/**` | 2 | 15 |
| `src/mastra/{agents,prompts,types}/**`, `index.ts`, `env.ts`, `config.ts`, `providers.ts`, `scripts/**`, `drizzle.config.ts` | 3 | 20 |
| `workspace/**` (runtime skills), `docs/**`, `README.md`, `AGENTS.md`, `CODING_STANDARDS.md`, `.env.example`, manifests | 5 | 76 |
| **Total** | | **200** |

Code scopes scored 3 or 4 in pass 1 and 2 or 3 here, with 124 code annotations against 176. The docs and skills scope went up (68 to 76): the imported skills (mermaid-diagrams, taste-skill, wrangler) were read line by line this time and hold most of the new findings.

## Cross-scope patterns

1. **The same gate, encoding or guard written in several places.** The "opted in and not banned" user gate (`chat/handlers.ts:52,218,242`, `chat/events.ts:30`, `chat/feedback.ts:75`); the Slack channel open gate (`tools/slack/read-conversation-history.ts:76`, `list-threads.ts:52`, `summarize-thread.ts`, `call-api.ts`); `isRecord` (`lib/logger/index.ts:39`, `chat/tool-display.ts:6`); the delegated tool id encoding (`processors/delegated-tools.ts` vs `chat/tool-display.ts:126`); the `agent-` tool name parsed three ways (`chat/tool-display.ts:188`); three Slack file id regexes (`tools/slack/get-slack-file.ts:31`, `tools/canvas/utils.ts:5`, `chat/attachments.ts`); five byte formatters (`tools/slack/get-slack-file.ts:10`, `tools/upload-emoji.ts:63`); two hand-rolled mutexes (`chat/allowed-users.ts:13`, `chat/state.ts:56`); `<!date^...>` built twice (`chat/app-home/scheduled-tasks/blocks.ts:46`); the Home refresh plus catch-and-log three times in `server/` (`server/github.ts:54`, `server/mcp.ts:93`); the command list in three places (`prompts/commands.ts:1`, `chat/commands/help.ts:5`).
2. **Tunable values inline.** Search knobs (`tools/slack/search-slack.ts:59`, `tools/search-web.ts:38`), summarize cap (`tools/slack/summarize-thread.ts:52`), Slack retry and timeout (`chat/client.ts:15`), GitHub request timeout (`lib/github/api.ts:14`), OAuth link lifetime in three units (`server/oauth.ts:31`), agent tuning (`agents/shared.ts:29`), `maxRetries: 3` on five ladder entries (`providers.ts:72`), prune and cleanup intervals (`index.ts:84`), list depth (`workspace/filesystem.ts:330`), git identity (`workspace/sandbox.ts:26`), a local `4` that duplicates `config.slack.userLookupConcurrency` (`tools/slack/utils.ts:43`).
3. **Prompt copy outside `prompts/`.** `chat/history.ts:68` (x3), `chat/attachments.ts:57`; in the other direction, prompts re-type names other modules own (`prompts/features/code-mode.ts:10`, `agents/explore.ts:36`, `prompts/github.ts:26` restating the `search_tools` rule).
4. **Hand-rolled library features.** `SlackAdapter.isDM` (`chat/adapter.ts:105`), a counting semaphore (`chat/adapter.ts:240`), a manual cursor loop where `webClient.paginate` exists (`chat/allowed-users.ts:108`), display name precedence the adapter already caches (`chat/names.ts:49`), `.env` parsed with sed (`scripts/dev-e2e.sh:25`), env cross-field rules outside `createFinalSchema` (`env.ts:83`), a default sort comparator (`mcp/user-servers/client.ts:195`), an SDK parameter type re-declared (`mcp/oauth.ts:108`). Several fixes need a new dependency (owner question).
5. **Weak fallbacks that hide our own mistakes.** `.catch('all')` and `.catch('write')` on modal input (`types/github.ts:27`, `types/mcp.ts:12`); an invented `image/png` (`chat/attachments.ts:45`); GitHub responses that fail to parse read as zero installations (`lib/github/api.ts:48`); an unchecked `get<string[]>` (`chat/allowed-users.ts:27`); `run_background` rebuilding a context with no user (`tools/run-background.ts:30`); a dead `?? 0` (`tools/code-mode/slack.ts:83`); `toolDisplay` trusted from a `$type` cast (`db/queries/settings.ts:18`).
6. **IO repeated per turn or per call.** `listMCPServers` twice per turn (`prompts/mcp.ts:11`); the title check fetching the Slack root every channel turn (`chat/title.ts:87`); two token lookups and two `GET /repos` per approved checkout (`tools/github/checkout.ts:55`); every MCP server decrypted to pick one (`server/mcp.ts:12`); visibility resolved for every channel a file is shared into (`tools/slack/utils.ts:90`); `exists` then `read` (`tools/artifacts.ts:61`); downloads without an abort signal (`tools/canvas/read.ts:41`, `tools/upload-emoji.ts:78`).
7. **Hyphens used as dashes in imported skills.** About 260 across mermaid-diagrams and taste-skill (`SKILL.md` and `references/*`), against owner decision 16 and `CODING_STANDARDS.md:160`. One mechanical pass, after the colon question below is answered.
8. **Skills and docs that contradict the prompts or the code.** `agent-browser/SKILL.md:19,23` restates and contradicts `prompts/core.ts`; `taste-skill/SKILL.md:11` contradicts the screenshot default in `prompts/features/sandbox.ts:15`; nine wrong Mermaid syntax claims; `README.md:23,262`, `docs/brokered-git.md:32`, `docs/slack-thread-ids.md:43`, `.env.example:26` behind the code.

## Rulebook contradictions

These go to the owner before cleanup, since every band would otherwise re-argue them. All are also in `TODO.md`.

1. **Comment kinds.** The reviewer brief allows only vendor or platform facts; `CODING_STANDARDS.md:149-171` also allows the why on fire-and-forget promises and ignored catches; reviewers disagreed on intent comments. Owner decision 1 (2026-09-24) needs restating in CODING_STANDARDS so both match.
2. **Large inline closures.** Owner decision 2 says closures over about 20 lines "may" be named functions; CODING_STANDARDS reads as "must". `agents/orchestrator.ts:64`, `processors/tool-display.ts:38` depend on the answer.
3. **Em dash replacements vs unslop.** `CODING_STANDARDS.md:160-161` lists the colon as a replacement; `unslop` rule 14 bans mid-sentence colons. The 260-dash pass needs one answer.
4. **Quotes.** `unslop` rule 19 says straight quotes; `taste-skill/references/assets-content.md:85` asks for typographic quotes on pages.
5. **Dict params vs library signatures.** Open since pass 1 Q8 (`CODING_STANDARDS.md:54`): `guardedFetch(input, init)` mirrors `fetch`; `MastraFilesystem` methods are positional.
6. **Fabricated data at a library contract.** `workspace/filesystem.ts:44` returns `new Date(0)` when E2B gives no modified time, and `:422` copies it into `createdAt` because `FileStat` requires one.
7. **Tunable values vs one-use constants.** Owner decision 6 puts deployment-tunable values in `config.ts`; reviewers disagree whether page sizes and result counts are tunable values.
8. **Dependencies.** AGENTS.md says ask before dependency changes; the "prefer libraries" preference says use maintained ones. `p-limit`, `async-mutex`, `p-map`, `pretty-bytes` are proposed.
9. **CODING_STANDARDS restating AGENTS.md.** `CODING_STANDARDS.md:192` repeats AGENTS "Boundaries"; type ownership is stated three times (`CODING_STANDARDS.md:126`); `AGENTS.md:71` caches numbers `config.ts` owns.
10. **Unwritten rules reviewers applied.** camelCase-only module constants, a class rule, `satisfies Processor`, `outputSchema` plus `transform.display` on every tool: each is either written into CODING_STANDARDS or dropped as a finding.

## Per scope

### chat (34, slop 3)

- **Patterns:** the user gate in five places with different order and failure handling; library features rewritten (`isDM`, semaphore, paginate, display name precedence); prompt copy in `history.ts` and `attachments.ts`, which also mutate the caller's `Message`; per-turn Slack fetches in `title.ts`; SCREAMING_CASE constants in two files.
- **Structure:** right. The turn pipeline, `adapter.ts` gap fills and `history.ts` stay. Misplaced: GitHub token refresh and installation counting inline in the generic Home assembler (`app-home/view.ts:90`); `names.ts` holds only `resolveUserProfile`.
- **Bands:**
  1. Security: `feedback.ts:69` (raw payload in logs).
  2. One user gate `admit({ message, thread, notice })` and one `answer({ follow })`: `handlers.ts:52,218,242`, `events.ts:30`.
  3. Libraries (dependency answer first): `adapter.ts:105,240`, `allowed-users.ts:13,108`, `names.ts:49`.
  4. Prompt copy and mutation: `history.ts:68,84`, `attachments.ts:57`.
  5. Boundaries and types: `allowed-users.ts:27,34`, `attachments.ts:45`, `adapter.ts:198`, `status/statuses.ts:55`.
  6. One source per encoding: `tool-display.ts:6,126,188`, `app-home/mcp/views.ts:10`, `app-home/scheduled-tasks/blocks.ts:46`, `commands/help.ts:5`, `commands/connections.ts:9`.
  7. Per-turn work: `title.ts:87`.
  8. MCP Home: `app-home/mcp/actions.ts:24,110,125`, `app-home/view.ts:90`.
  9. Naming and config: `app-home/presets.ts:4`, `names.ts:21`, `client.ts:15`, `history.ts:51`.
- **Orphans:** none found.
- **Keep:** `turn-drain.ts`, the adapter's recipient cache, member-left and lookup dedupe map, `history.ts` backfill, `state.ts` on Mastra `threadState`, the statuses table shape.

| Where | Rule | What | Fix |
| --- | --- | --- | --- |
| `chat/adapter.ts:105` | duplicate of library | re-implements SlackAdapter.isDM(threadId), which is this exact check | `this.isDM(threadId)` and drop the local decode |
| `chat/adapter.ts:198` | weak type | `unknown[]` accepts anything and Slack rejects bad blocks only at runtime | type as `SlackBlock[]` from `@chat-adapter/slack/blocks` (already used by app-home/limit.ts) |
| `chat/adapter.ts:240` | hand-rolled library | a bespoke counting semaphore (activeLookups/waitingLookups) where a maintained limiter exists | `p-limit(config.userLookupConcurrency)` wrapping super.lookupUser (dependency change: ask owner); keep the in-flight dedupe map |
| `chat/allowed-users.ts:13` | duplication | second hand-rolled promise-chain mutex (state.ts:56 is the other) | one keyed `serialize(key, fn)` helper in lib, or `async-mutex` (dependency change: ask owner) |
| `chat/allowed-users.ts:27` | unchecked cast | `get<string[]>` trusts whatever the state store holds (x2 in this file, also in optInStatus) | parse with `z.array(z.string())` |
| `chat/allowed-users.ts:34` | swallowed catch without why | CODING_STANDARDS requires a reason on an intentionally ignored catch | add the one-line why (the caller gets the rejection through `write`) |
| `chat/allowed-users.ts:108` | hand-rolled library | manual cursor loop plus a biome-ignore where @slack/web-api ships `webClient.paginate('conversations.members', ...)` | iterate the paginator and drop the ignore |
| `chat/app-home/mcp/actions.ts:24` | long function | ~90 lines mixing validation, GitHub refusal, DB insert and a background probe chain | split out `probeAndPublish({ userId, server })` for the code after the limit checks |
| `chat/app-home/mcp/actions.ts:110` | hidden error | a failed probe or second publishHome is logged at debug, so the server shows no error and nobody sees why | log at warn |
| `chat/app-home/mcp/actions.ts:125` | silent no-op | at the limit the Add click does nothing (stale Home tab shows the button) | refreshHome and notify the user, or open the modal and let insertMCPServer's limit-reached error show |
| `chat/app-home/mcp/views.ts:10` | duplication | same scope RadioSelect as github/views.ts:12 with different copy, and `id: 'scope'` is a literal while github uses ids.scope | one `scopeSelect({ id, threads, descriptions })` in presets.ts |
| `chat/app-home/presets.ts:4` | naming | SCREAMING_CASE (PRESETS, SCOPE_LABELS, moderation/index.ts DURATION) while every other module constant is camelCase | `presets`, `scopeLabels`, `banDurations` |
| `chat/app-home/scheduled-tasks/blocks.ts:46` | duplication | Slack `<!date^...>` token built by hand again (moderation/cards.ts:8 `until`) | one `slackDate(date, fallback)` helper both use |
| `chat/app-home/view.ts:90` | feature logic in shared module | GitHub token refresh, installation count and 401 recording live inline in the generic Home assembler | move to `app-home/github/` as `githubInstallations(userId, credential)` |
| `chat/attachments.ts:45` | fabricated data | invents `image/png` for an image with no MIME type, so the model is told it can see a file channels may not have inlined | treat a missing mimeType as not inlined, or read the real type channels used |
| `chat/attachments.ts:57` | prompt copy outside prompts/ | tool-usage instruction to the model built in chat code | move to `src/mastra/prompts/` beside the get_slack_file guidance |
| `chat/client.ts:15` | config values in config.ts | retry factor, retry count and the 15s timeout are deployment settings inlined here | move to `slack` in `src/mastra/config.ts` |
| `chat/commands/connections.ts:9` | magic string | hard-codes the built-in MCP server that mcp/index.ts:7 configures | list the configured built-in server names from that config |
| `chat/commands/help.ts:5` | duplication | command list is hand-written apart from the `commands` Map in commands/index.ts, so adding a command leaves help stale | store a one-line description beside each Map entry and render help from it |
| `chat/events.ts:30` | duplication | 'opted in and not banned' is checked here, in feedback.ts:75 and in handlers.ts with different order and failure handling | one `isBlocked(userId)` predicate in moderation or allowed-users |
| `chat/feedback.ts:69` | secret in logs | the raw block_actions payload carries `response_url` (a 30-minute post credential) and `trigger_id` | log `actionId`, `value` and `userId` only |
| `chat/handlers.ts:52` | boolean parameter | `offer` switches between two behaviours, and onSubscribedMessage re-implements a silent ban check for the same reason | one gate `admit({ message, thread, notice: 'offer' \| 'silent' })` returning the decline reason, used by all three handlers |
| `chat/handlers.ts:218` | duplication | the else branch below is an inline copy of turnAwayBanned minus the notice | fold into the shared gate proposed above turnAwayNotOptedIn |
| `chat/handlers.ts:242` | duplication | body is onMention line for line except `follow` (and DMs never need it) | one `answer({ follow })` function both handlers call |
| `chat/history.ts:51` | nested ternary in template | plural and attachment suffix ternaries nested inside one template literal | build `files` suffix in a named const before the push |
| `chat/history.ts:68` | prompt copy outside prompts/ | model-facing instructions (x3 in this file, also attachments.ts:57) live in chat code | move the strings to `src/mastra/prompts/` and import them |
| `chat/history.ts:84` | mutated argument | overwrites the caller's Message (attachments.ts:61 does the same) so the `return message` hides a side effect | either name it `prependHistory(message): void` or return a copied Message; share one `setMessageText` with attachments.ts |
| `chat/names.ts:21` | unclear file name | file is `names.ts` but holds only resolveUserProfile | rename the file `user-profile.ts` |
| `chat/names.ts:49` | duplicate of library | re-derives the display_name/real_name precedence the Slack adapter's lookupUser already computes and caches | take displayName/realName from `bot.getUser(userId)` and call users.info only for tz fields |
| `chat/status/statuses.ts:55` | magic strings | ~50 tool names typed as plain `string`, so a renamed tool silently loses its status | key the map by the toolset's tool-name union (`satisfies Partial<Record<ToolName, ...>>`) |
| `chat/title.ts:87` | per-turn work | every channel turn re-fetches the root from Slack, lists memory threads and reads thread state before checking `lastSentSlackTitle` | read state first and cache 'root does not open with a bot mention' in ThreadState so non-qualifying threads stop after one fetch |
| `chat/tool-display.ts:6` | duplication | byte-for-byte copy of isRecord in lib/logger/index.ts:38 | export one from lib, or use `z.record(z.string(), z.unknown()).safeParse` |
| `chat/tool-display.ts:126` | duplication across files | the `::` toolCallId and `<agent>_<tool>` toolName encoding is written in processors/delegated-tools.ts:30 and decoded here by string literals | export one encode/decode pair from delegated-tools.ts and use it in both places |
| `chat/tool-display.ts:188` | duplication | the `agent-` subagent tool-name shape is parsed three ways (here, runningDetails, status/index.ts) | one exported `parseAgentTool(toolName)` returning { agent, tool? } |

### tools (34, slop 3)

- **Patterns:** the Slack channel gate copied four times; byte formatting five ways and file id regexes three ways; untyped tool outputs (`z.unknown()` schedules, `Record<string, unknown>` GitHub tools, GitHub tools with no `outputSchema`); downloads without abort signals; tunable values inline.
- **Structure:** right: one file per tool, `slack/utils.ts` as the shared security layer, `toolsets.ts` the only registry. Misplaced: `viewableImageType` exported from a tool file and imported by two other tools (`view-image.ts:8`).
- **Bands:**
  1. Security: `github/git.ts:120,134` (S3 residual), `run-background.ts:30`.
  2. Canonical sources: `slack/get-slack-file.ts:10,31`, `upload-emoji.ts:63`, `canvas/utils.ts:5`, `view-image.ts:8`, `slack/read-conversation-history.ts:76`, `slack/list-threads.ts:52`.
  3. Config: `slack/search-slack.ts:59`, `search-web.ts:38`, `slack/summarize-thread.ts:52`, `slack/utils.ts:43`.
  4. Output contracts: `scheduled-tasks/create.ts:58`, `scheduled-tasks/list.ts:11`, `github/checkout.ts:49`, `github/push.ts:61`, `github/index.ts:16`, `slack/upload-file.ts:131`.
  5. IO: `upload-emoji.ts:78`, `canvas/read.ts:41`, `github/checkout.ts:55`, `slack/utils.ts:90`, `artifacts.ts:61`.
  6. Registration: `upload-emoji.ts:47` (register only when `EMOJI_PROXY_TOKEN` is set).
  7. Small: `code-mode/slack.ts:49,83`, `canvas/create.ts:48`, `canvas/sections.ts:35`, `slack/read-conversation-history.ts:64`, `scheduled-tasks/create.ts:68`.
  8. Owner calls: `slack/get-slack-file.ts:97` (reopens decision 14), `slack/post-message.ts:72`.
- **Orphans:** `upload_emoji` offered by tool search when the proxy is not configured; the private-channel advice in `post-message.ts:72` if those error codes are unreachable.
- **Keep:** `git.ts` config pins, `oneWindowPerSandbox` and fatal teardown; `search-slack.ts` public-only check; `call-api.ts` per-method schema map; `run-background.ts` `wakeChannels`; code mode's read-only MCP filter.

| Where | Rule | What | Fix |
| --- | --- | --- | --- |
| `tools/artifacts.ts:61` | extra round trip | files.exists then files.read is two sandbox calls and a check-then-act gap | read once and map e2b's NotFoundError to the "No artifact" message |
| `tools/canvas/create.ts:48` | duplication | the title and document_content spreads are built twice (here and the channel branch below) | build `const content = { ...title, ...document_content }` once before branching |
| `tools/canvas/read.ts:41` | unbounded IO | no signal, so a stop or abort does not cancel the download (get-slack-file.ts passes one) | fetchPrivateSlackFile({ url, signal: context.abortSignal }) |
| `tools/canvas/sections.ts:35` | validation outside the boundary | "one of sectionTypes or containsText" is checked in execute with a ternary-and-&& chain | .refine on inputSchema (as upload-emoji.ts and list.ts do), then build criteria with plain spreads |
| `tools/canvas/utils.ts:5` | duplicate model | a third Slack file id pattern (see get-slack-file.ts) | derive canvasIdSchema from the single file id pattern in lib/ids.ts |
| `tools/code-mode/slack.ts:49` | duplication | the same workspaceAccess ternary builds the tool set here and again at line ~70 inside execute | one `toolsFor(requestContext?)` closure used in both places |
| `tools/code-mode/slack.ts:83` | dead fallback | JSON.stringify(null) is the string 'null', so `?.length ?? 0` can never apply | JSON.stringify(outcome ?? null).length |
| `tools/github/checkout.ts:49` | inconsistent tool shape | github_checkout and github_push_branch (push.ts) are the only tools in scope with no outputSchema or transform.display, so their widget falls back to the generic label | add outputSchema { path, sha, note } and a display summary like the other tools |
| `tools/github/checkout.ts:55` | repeated reads | requireApproval above already ran inspectRepository, so every approved checkout does two token lookups and two GET /repos calls | cache the access result per tool call (keyed by repository in the requestContext) or have repoAccess memoize per request like githubAccess |
| `tools/github/git.ts:120` | security boundary | optional threadId means the live-job refusal below is silently skipped when it is missing, yet both tools are only registered when a thread exists (github/index.ts `direct && threadId`) | make threadId required and pass it from the tool factory instead of channelContext |
| `tools/github/git.ts:134` | security S3 residual | the check is one-way; startJob (workspace/jobs.ts) never asks whether a window is open, so a run_background called in the same step after this check runs with the token attached | also refuse startJob while credentialWindows has the sandbox, and record the parallel execute_command gap in docs/brokered-git.md |
| `tools/github/index.ts:16` | erased types | Record<string, unknown> drops every tool type, so orchestrator.ts spreads unchecked values into its tool map | return ToolsInput from @mastra/core/agent (the type code-mode/slack.ts already uses) |
| `tools/github/push.ts:61` | inconsistent tool shape | no outputSchema or transform.display, unlike every non-GitHub tool | add outputSchema { branch, sha } and a "Pushed <branch>" summary |
| `tools/run-background.ts:30` | weak fallback | the rebuilt context has no userId, so the claimTurn limit below is silently skipped; per the comment above a restart loses the job anyway, so this branch is either dead or a limit bypass | when `saved` is missing, log and return instead of rebuilding |
| `tools/scheduled-tasks/create.ts:58` | untyped output | schedule is z.unknown() here, in list.ts and manage.ts (x3), so the model gets the raw row (prompt, wake options, requestContext) and no display summary | a small schema of the fields the model needs (id, name, cron, timezone, status, nextFireAt) plus transform.display |
| `tools/scheduled-tasks/create.ts:68` | misleading name, non-atomic cap | `active` also counts paused schedules, and list-then-create lets parallel calls in one step pass the cap together | rename to `existing`; serialize per resourceId (or accept and say so) |
| `tools/scheduled-tasks/list.ts:11` | untyped output | z.array(z.unknown()) returns whole schedule rows | share the schedule output schema proposed in create.ts |
| `tools/search-web.ts:38` | tunable inline | result count is a per-deployment knob | search.webResults in config.ts next to search.snippetChars |
| `tools/slack/get-slack-file.ts:10` | duplication across files | a private byte formatter while upload-emoji.ts, view-image.ts, upload-file.ts and generate-image/request.ts each inline their own MB math | one shared formatBytes in src/mastra/lib used by all five |
| `tools/slack/get-slack-file.ts:31` | duplicate model | three different Slack file id regexes (here, canvas/utils.ts:8 `^F[A-Z0-9]+$`, chat/attachments.ts:22 `\bF[A-Z0-9]{6,}\b`) | one fileIdOf/fileIdSchema in lib/ids.ts beside parseSlackId |
| `tools/slack/get-slack-file.ts:97` | owner call, deletion test | about 70 lines of resume state (.part, .next, .merge, HEAD probe, Range request, shell cat merge) only pays off when a call is aborted mid-download and re-run with the same id | stream to `${path}.part`, check the size, rename; drop resume unless large Slack files are a real workload |
| `tools/slack/list-threads.ts:52` | duplication across files | the same chatChannelId, assertReadableChannel, joinChannel gate as read-conversation-history.ts | use the shared openReadableChannel helper proposed there; also rename `chId` |
| `tools/slack/post-message.ts:72` | stale error mapping | assertCanPostTo now pins posts to the current channel or the requester's DM and slackDestination joins first, so "bot is not a member of that private channel" advice no longer fits | confirm these codes are unreachable, then drop this catch and the "Errors:" paragraph in the description |
| `tools/slack/read-conversation-history.ts:64` | unclear names | `tid` and `chId` abbreviate (also list-threads.ts:51) | slackThread and channel, or names that say which id format they hold |
| `tools/slack/read-conversation-history.ts:76` | duplication across files | chatChannelId, assertReadableChannel, joinChannel is the same three-step gate here, list-threads.ts:52, summarize-thread.ts:47 and call-api.ts:132 (x4) | one `openReadableChannel({ channelId, currentThreadId })` in slack/utils.ts that returns the chat channel id |
| `tools/slack/search-slack.ts:59` | tunable values inline | context size 3 (x2 here), context snippet 400 (line ~137) and page size `limit: 10` (line ~202) are search knobs | move them into config.search beside snippetChars |
| `tools/slack/summarize-thread.ts:52` | tunable inline | 100 is also hard-coded in the description ("up to 100 messages") and can drift | config.slack.summarizeMaxMessages, interpolated into both |
| `tools/slack/upload-file.ts:131` | loosened type | fileId is always returned (line 53 throws without it) | z.string() |
| `tools/slack/utils.ts:43` | tunable inline and hand-rolled library | a local 4 duplicates config.slack.userLookupConcurrency, and the slice loop reimplements bounded concurrency (each batch waits for its slowest lookup) | read the limit from config.ts and use p-map's `concurrency` (already in the tree via @mastra/core; a direct dependency needs owner approval) |
| `tools/slack/utils.ts:90` | wasted lookups | resolves visibility for every channel the file is shared into, though only "any readable" is used | check the current conversation first and stop at the first readable channel |
| `tools/upload-emoji.ts:47` | dead tool | upload_emoji is always registered in deferredTools, so with EMOJI_PROXY_TOKEN unset tool search offers a tool that can only throw | add it to deferredTools in toolsets.ts only when env.EMOJI_PROXY_TOKEN is set, and drop this check |
| `tools/upload-emoji.ts:63` | duplication across files | five hand-written byte formatters disagree (here and view-image.ts, upload-file.ts use 1_000_000 and round to 0MB under 500KB; generate-image/request.ts uses 1024*1024; get-slack-file.ts has formatBytes) | one formatBytes in src/mastra/lib, or `pretty-bytes` (dependency change: ask) |
| `tools/upload-emoji.ts:78` | unbounded IO | both proxy fetches pass neither context.abortSignal nor a timeout, so a hung proxy holds the turn until the step limit (x2 in this file) | pass AbortSignal.any([context.abortSignal, AbortSignal.timeout(emoji.requestTimeoutMs)]) with the timeout in config.ts |
| `tools/view-image.ts:8` | structure | a shared media helper exported from a tool file and imported by slack/get-slack-emoji.ts and generate-image/request.ts | move viewableImageType to src/mastra/lib (e.g. lib/media.ts) so tools import a lib, not each other |

### lib, db, server, observability, drizzle (21, slop 2)

- **Patterns:** a shared advisory lock key for two unrelated locks; invented values on parse failure; `server/` copying the Home refresh; secret resealing written three times inside `db/index.ts`; tunable values inline.
- **Structure:** mostly right. `resealSecrets` belongs in `db/reseal.ts`; `ALREADY_IN_CHANNEL` belongs out of the logger (`lib/logger/slack.ts:6`); the app logger is named after one agent.
- **Bands:**
  1. Correctness: `db/queries/usage.ts:66`, `db/queries/mcps.ts:93`, `lib/github/api.ts:48`, `drizzle/20260924024825_slack_memory_thread_ids/migration.sql:43` (fix in a new migration).
  2. Security S9: `server/oauth.ts:65`.
  3. One helper: `server/github.ts:54`, `server/mcp.ts:93`, `lib/logger/index.ts:39`, `db/queries/github.ts:58`.
  4. Moves: `db/index.ts:35`, `lib/logger/slack.ts:6`.
  5. Config: `lib/github/api.ts:14`, `server/oauth.ts:31`.
  6. Dead and redundant: `server/oauth.ts:143`, `lib/error-handling.ts:18,53`, `db/queries/usage.ts:82`, `server/oauth.ts:68`.
  7. Validation and over-fetch: `db/queries/settings.ts:18`, `server/mcp.ts:12`.
  8. Naming: `lib/logger/index.ts:5`.
- **Orphans:** the `oauthRedirectUri` undefined checks (`server/oauth.ts:143`).
- **Keep:** key rotation and resealing (moved, not removed), GitHub token refresh dedupe, per-request `githubAccess` caching, `slack-identity.ts` dropping `requestContext`, `model-errors.ts`, `ids.ts`, `approval.ts`.

| Where | Rule | What | Fix |
| --- | --- | --- | --- |
| `drizzle/20260924024825_slack_memory_thread_ids/migration.sql:43` | orphaned rows | a row whose (new_id, type) already exists is skipped and stays under old_id forever | DELETE the leftover old_id rows after this UPDATE (in a new migration, this one may have run). |
| `db/index.ts:35` | long function, wrong home | 115 lines with three copies of select-not-like, reseal, compare-and-set, inside db/index.ts | move to db/reseal.ts and drive the three tables from one list of { table, keys, secret column }. |
| `db/queries/github.ts:58` | duplication | the sealed column set (expiresAt, lastError null, encrypted refreshToken and token) is built again from setGitHubCredential | one sealCredential(credential) mapping used by both. |
| `db/queries/mcps.ts:93` | lock key collision | same advisory key as recordTurnWithinLimit (usage.ts:66) | scope the key, see the note there. |
| `db/queries/settings.ts:18` | unvalidated read | toolDisplay trusts the schema's $type cast while githubPermission above is Zod-parsed | parse with toolDisplayModeSchema (optional, catch undefined). |
| `db/queries/usage.ts:66` | lock key collision | same advisory key as insertMCPServer (mcps.ts:93), so a turn claim and an MCP add for one user block each other | one shared lockUser({ tx, scope }) using the two-key form pg_advisory_xact_lock(hashtext(scope), hashtext(id)). |
| `db/queries/usage.ts:82` | misleading return | usage here is the pre-insert count and the only caller (chat/usage.ts:15) ignores it when recorded | return { recorded: true } \| { recorded: false; usage }. |
| `lib/error-handling.ts:18` | one-shot builder | one caller (agents/shared.ts:13) and no per-call state | export the array as a const or inline it in shared.ts. |
| `lib/error-handling.ts:53` | redundant option | equals the processor-level maxRetries above, which Mastra falls back to | drop it; only delayMs differs. |
| `lib/github/api.ts:14` | tunable in code | the GitHub request timeout is inline while MCP's lives in config.mcp.oauthRequestTimeoutMs | add config.github.requestTimeoutMs. |
| `lib/github/api.ts:48` | invented value | a body that fails to parse becomes "0 installations", which sends the callback to the install page (server/github.ts:61) | return { error } when the shape does not parse, as githubUser does. |
| `lib/logger/index.ts:5` | naming | the app-wide logger (db, server, chat, lib all log through it) is named after one agent | name it 'gorkie'. |
| `lib/logger/index.ts:39` | duplication | the same isRecord guard is copied in chat/tool-display.ts:6 | keep one shared guard (or parse with z.record(z.string(), z.unknown())). |
| `lib/logger/slack.ts:6` | misplaced module | a Slack API error code lives in the logger and tools/slack/utils.ts and chat/onboarding.ts import it from here | move it to a Slack-owned module (types/ or chat/client.ts) and import it into the logger. |
| `server/github.ts:54` | duplication | awaited publishHome plus catch-and-log is copied in mcp.ts and oauth.ts (x3); chat/app-home/view.ts already has refreshHome | call refreshHome, the result page does not depend on it. |
| `server/mcp.ts:12` | over-fetch | loads and decrypts every server of the user to pick one | a getMCPServer({ name, userId }) query in db/queries/mcps.ts. |
| `server/mcp.ts:93` | duplication | same catch-and-log as server/github.ts:54 | refreshHome(token.slackUserId). |
| `server/oauth.ts:31` | duplicated tunable | the link lifetime is 600 s here, 600_000 ms at the nonce TTL below and Factory's fixed 10 minutes | one config.oauth.linkTtlMs feeding both. |
| `server/oauth.ts:65` | security S9 | the Chat state adapter is in-process memory (chat/state.ts:9), so a used start link replays after a restart | record the nonce in Postgres (Mastra threadState domain or a small table). |
| `server/oauth.ts:68` | readability | one condition mixes four checks, two awaits and a consume/peek ternary | early returns per check, then a named `fresh` boolean for the nonce step. |
| `server/oauth.ts:143` | dead check | oauthRoutes exist only when PUBLIC_BASE_URL is set, so oauthRedirectUri cannot be undefined here (also the callback route) | build the URI from env.PUBLIC_BASE_URL inside the routes and drop the branch. |

### mcp, workspace, processors (15, slop 2)

- **Patterns:** literals and names repeated beside the module that owns them (`workspace/tool-names.ts` bypassed three times); a template build that floats to latest; long functions in processors.
- **Structure:** right. `workspace/build-template.ts` is a script under `src/mastra` that needs every bot secret; it belongs in `scripts/` reading only `E2B_API_KEY` and `PROJECT_ROOT`. `unlabelledServers` is memory-only state shared with Home (`mcp/user-servers/tools.ts:7`, also in the no-comments leftovers).
- **Bands:**
  1. Template supply chain and placement: `workspace/build-template.ts:1,53`.
  2. MCP state and long function: `mcp/user-servers/tools.ts:7,18`.
  3. Processor readability: `processors/tool-display.ts:14,38`, `processors/tool-media.ts:45`, `processors/step-guard.ts:15`. Pass 1 tried building the step-guard regex from one array and reverted it (Biome `noUnnecessaryConditions` on the `exec` loop, `IMPLEMENTED.md` 2026-09-24); do not retry it the same way.
  4. One source per literal: `workspace/index.ts:71,209,278`, `workspace/sandbox.ts:26`, `workspace/filesystem.ts:330`, `mcp/oauth.ts:108`.
  5. Small: `mcp/user-servers/client.ts:195`.
- **Report-only (patches):** the 50 and 40 caps are hard-coded twice in `patches/@mastra+core@1.69.0.patch`; `scripts/verify-mastra-patch.ts` has no markers for `sessionTaskIds.size >= 40` or the fallback retry reset.
- **Orphans:** the `workspace/index.ts:209` re-export of `tool-names.ts`.
- **Keep:** `ripgrep.ts`, `tool-search.ts`, `stale-messages.ts`, `output-budget.ts`, `working-model.ts`, `describeMCPError` redaction, the partial-listing cache, `guardedFetch`.

| Where | Rule | What | Fix |
| --- | --- | --- | --- |
| `mcp/oauth.ts:108` | duplicate type | the scope union re-declares the SDK's own parameter type | use Parameters<OAuthClientProvider['invalidateCredentials']>[0] |
| `mcp/user-servers/client.ts:195` | redundant code | this comparator is the default string sort | use .sort() (or .toSorted()) |
| `mcp/user-servers/tools.ts:7` | hidden shared state | a module-global Set written per turn here and read by app-home/mcp/views.ts, empty after a restart so Home hides the warning until the next turn | persist the flag on the server row (schema change: ask) or have Home derive it from the cached client's toolsets |
| `mcp/user-servers/tools.ts:18` | long function | ~75 lines doing listing, unlabelled bookkeeping, error recording and key flattening | split the label scan and the error write into named module functions called from here |
| `processors/step-guard.ts:15` | duplicate model | the tag names are listed twice, in this regex and in markupTags below | build both from one const tag-name array |
| `processors/tool-display.ts:14` | comment essay | 16 lines across three paragraphs narrating channels internals | keep one or two lines per vendor fact (render object copied on the first chunk; function-form display resolves to 'cards') and move the rest to IMPLEMENTED.md |
| `processors/tool-display.ts:38` | large inline closure | a 28-line async IIFE inside the processor literal | a module-level applyToolDisplay({ requestContext, state }) per CODING_STANDARDS |
| `processors/tool-media.ts:45` | long function | ~125 lines with a scan pass, a budget pass and a rewrite pass nested four deep | split into collectImages, keepWithinBudget and rewritePrompt helpers called from here |
| `workspace/build-template.ts:1` | misplaced script | a standalone bun script under src/mastra that imports env (so it needs every bot secret to build a template) | move to scripts/ and read only E2B_API_KEY and PROJECT_ROOT |
| `workspace/build-template.ts:53` | unpinned supply chain | agent-browser, wrangler and the `nodesource` setup script float to latest on every template build while cloakbrowser is pinned | pin exact versions (agent-browser@x.y.z wrangler@x.y.z) like cloakbrowser==0.5.10 |
| `workspace/filesystem.ts:330` | magic number | the 100 depth default is repeated in walk() | one value in config.ts (file.maxListDepth), or let walk own the default |
| `workspace/index.ts:71` | duplicated literal | this refusal text is repeated verbatim in beforeToolCall's output below | one const shared by both |
| `workspace/index.ts:209` | pass-through re-export | tool-names.ts is already its own module | have tools/code-mode/slack.ts import from '../../workspace/tool-names' and drop this line |
| `workspace/index.ts:278` | inconsistent source | get_process_output and kill_process are inline while every other model-facing name comes from tool-names.ts | add them there or inline all names |
| `workspace/sandbox.ts:26` | magic string | the git identity 'gorkie-agent' is written twice inline | one value in config.ts (sandbox.gitAuthorName) next to agentmail.inbox |

### agents, prompts, types, root files, scripts (20, slop 3)

- **Patterns:** prompts re-typing names other modules own; per-turn MCP listing done twice; model tuning inline in `agents/shared.ts` and on every ladder entry; `index.ts` holding trace store and schedule policy.
- **Structure:** mostly right. `index.ts` should shrink to boot: trace store to `observability/trace-store.ts`, schedule gate to `tools/scheduled-tasks/hooks.ts`. `ProviderHistoryCompat` is built twice (`agents/summarizer.ts:17`).
- **Bands:**
  1. Weak fallbacks on input: `types/github.ts:27`, `types/mcp.ts:12`, `types/channel.ts:7`. Low code quality, not security: radios offer only our values and Slack submissions are signature-verified, so a bad value can only come from our own bug (an option renamed in a view but not the schema) or a modal opened before a deploy. The `.catch` hides that mistake by failing open.
  2. Per-turn IO: `prompts/mcp.ts:11`.
  3. Slim `index.ts`: `index.ts:55,93`.
  4. Config: `agents/shared.ts:29`, `providers.ts:72`, `index.ts:84`.
  5. Names from their owners: `agents/explore.ts:36`, `prompts/features/code-mode.ts:10`, `prompts/commands.ts:1`.
  6. Prompt dedupe: `prompts/github.ts:26`.
  7. Providers: `providers.ts:31` (record each entry's slug, compare exactly).
  8. Env: `env.ts:33,83`.
  9. Shared setup: `agents/summarizer.ts:17`, `agents/orchestrator.ts:64`.
  10. Scripts: `scripts/verify-mastra-patch.ts:42`, `scripts/dev-e2e.sh:25`.
- **Orphans:** none found.
- **Keep:** the three patches, vendor comments in `config.ts`, `env.ts` production checks (moved into the schema, not removed), the research and explore prompts.

| Where | Rule | What | Fix |
| --- | --- | --- | --- |
| `scripts/dev-e2e.sh:25` | library over hand-rolled | a sed regex re-parses .env (misses export prefixes, inline comments, escapes) and re-implements env.ts's min(32) rule | read it through Bun's own .env loading, e.g. token="$(bun -e 'process.stdout.write(process.env.GORKIE_API_TOKEN ?? "")')" |
| `scripts/verify-mastra-patch.ts:42` | inconsistent error handling | the Mastra bundles get an existsSync check and a readable message, but a missing slack dist throws a raw ENOENT stack | check existsSync(slackDist) and push a "not found" line like the bundles do |
| `src/env.ts:33` | validate at boundaries | OPT_IN_CHANNEL takes any string while LOGS_CHANNEL below checks the channel-id shape inline | add `slackChannelIdSchema` beside slackUserIdSchema in types/user.ts and use it for both |
| `src/env.ts:83` | library over hand-rolled | cross-field production rules are checked after createEnv with plain throws, outside the schema and its error formatting | express them in env-core's `createFinalSchema` (available in the installed 0.13.11) with a superRefine |
| `agents/explore.ts:36` | magic strings | workspace tool names re-typed as literals, so a rename in workspace/tool-names.ts silently drops them from Explore | import READ_FILE, LIST_FILES, GREP, FILE_STAT from '../workspace/tool-names' |
| `agents/orchestrator.ts:64` | no large inline closures | defaultOptions (about 40 lines with nested delegation, stopWhen, onAbort) and the async tools resolver below (about 25 lines) sit inline in the Agent literal | move each to a named module-scope function with explicit parameter types |
| `agents/shared.ts:29` | deployment values in config.ts | topP 0.95, reasoning 'medium', toolCallConcurrency limit 10 and maxProcessorRetries 2 (line 14) are per-deployment model tuning inlined here | move them under `agent` in config.ts |
| `agents/summarizer.ts:17` | duplication | same ProviderHistoryCompat({ additionalRules: [moveToolImages] }) as agents/shared.ts:22 | export it once from shared.ts (e.g. `providerCompat`) and reuse it here and in historyProcessors |
| `index.ts:55` | index.ts owns everything | the local trace store open, init, prune and interval (lines 56 to 86) is observability wiring inside the entry file | move it to observability/trace-store.ts exporting `traceStore` |
| `index.ts:84` | deployment values in config.ts | the daily prune interval here and the hourly backgroundTasks cleanupIntervalMs (line 179) are inline magic numbers | add `observability.pruneIntervalMs` and a `backgroundTasks.cleanupIntervalMs` to config.ts |
| `index.ts:93` | index.ts owns everything | deleteFiredWait and gateScheduledFire (ban check, turn claim, creator parsing with an inline z.object built per fire) are schedule policy, not boot | move them to tools/scheduled-tasks/hooks.ts next to isWaitSchedule and hoist the creator schema |
| `prompts/commands.ts:1` | duplication | the command list and descriptions are written twice, here and in chat/commands/help.ts:8, while the registry lives in chat/commands/index.ts:11 | give each registry entry a description and render both the prompt and !help from it |
| `prompts/features/code-mode.ts:10` | magic strings | line 24 hand-lists the eight external_* functions that workspace/tool-names.ts `codeModeToolNames` already defines, so the prompt drifts when that set changes | interpolate `[...codeModeToolNames].map((name) => `external_${name}`).join(', ')` |
| `prompts/github.ts:26` | single source of truth | the search_tools reload rule below is restated in prompts/mcp.ts:32 and already stated generically in prompts/tools.ts:6 | keep it once in <tools> and say here only that github_ tools are search-loaded |
| `prompts/mcp.ts:11` | repeated per-turn read | every turn runs listMCPServers twice for the same user, here and in mcp/user-servers/tools.ts:25 via the orchestrator tools resolver, and both split servers by `isDM \|\| server.threads` | load once per request (cache on requestContext like githubAccess) and share the partition |
| `providers.ts:31` | unclear invariant | modelSlug probes three model shapes (the string branch never occurs, every entry comes from opencode() or hackclub()) and preferLastWorking then matches slugs by suffix in both directions | record each ladder entry's slug when building it and compare exactly |
| `providers.ts:72` | deployment values in config.ts | `maxRetries: 3` is repeated on all five ladder and summarizer entries | one `agent.modelRetries` in config.ts, applied in opencode() and a hackclub wrapper |
| `types/channel.ts:7` | one canonical source | optional isDM forces `=== true` normalisation at three call sites (agents/orchestrator.ts:123, prompts/index.ts:21, mcp/user-servers/approval.ts:9) | `z.boolean().default(false)` and read `ctx.isDM` directly |
| `types/github.ts:27` | weak fallback | `.catch('all')` also runs on modal input (chat/app-home/github/actions.ts:31), so a bad or tampered submit silently becomes 'all' instead of a field error; view.ts:130 re-parses an already parsed value | keep a plain enum for input, apply the default only where the DB row is read (db/queries/settings.ts:15) |
| `types/mcp.ts:12` | weak fallback | `.catch('write')` also parses modal input (chat/app-home/mcp/actions.ts:207), turning an invalid submit into 'write' silently | plain enum for input, default only at the DB read (db/queries/mcps.ts:26) |

### runtime skills, docs, rules (76, slop 5)

- **Patterns:** wrong Mermaid syntax taught as fact (nine places); about 2,900 lines of copied upstream docs in mermaid-diagrams; wrangler written for an account the sandbox does not have; taste-skill contradicting itself and the prompts; hyphen-dashes; docs behind the code.
- **Structure:** right, with two ownership problems: `unslop` duplicated between `.agents/skills/` and `workspace/skills/` (`workspace/skills/unslop/SKILL.md:5`), and the same two-instance warning in three files (`README.md:159`).
- **Bands:**
  1. Runtime behavior: `agent-browser/SKILL.md:5,19,23,48`, `taste-skill/SKILL.md:11`, `67ify/SKILL.md:29`.
  2. Mermaid correctness then trim: `mermaid-diagrams/references/erd-diagrams.md:43,53,58,427`, `flowcharts.md:27,250`, `advanced-features.md:241,274,307,412`, `architecture-diagrams.md:40`, then `mermaid-diagrams/SKILL.md:5,18,148,161,211`.
  3. Wrangler fit: `wrangler/SKILL.md:8,13,38,85`, `wrangler/references/config-and-bindings.md:13,14,102,229`, `wrangler/references/operations.md:46`.
  4. Mermaid CLI in the template: `mermaid-diagrams/SKILL.md:11` (preinstall, or point `PUPPETEER_EXECUTABLE_PATH` at the template browser).
  5. Taste-skill contradictions: `references/assets-content.md:12,23,85`, `ai-tells.md:28,53,59,63`, `motion.md:21`, `architecture.md:10`, `type-color-layout.md:18`, `design-systems.md:45`, `redesign.md:44`, `SKILL.md:154`.
  6. Dash pass: every `unslop dash` annotation (14 files, about 260 hyphens), after rulebook question 3.
  7. Docs accuracy: `README.md:23,113,159,262`, `.env.example:26`, `docs/brokered-git.md:32,64`, `docs/slack-thread-ids.md:43`, `github/references/failures.md:15`.
  8. AgentMail reference trim: `agentmail/references/api.md:14,107,182`.
  9. Rulebook: `CODING_STANDARDS.md:54,126,192`, `AGENTS.md:71`.
  10. One `unslop` copy: `unslop/SKILL.md:5` (symlink the dev copy to the runtime one).
- **Manifests:** nothing new; `is_mcp_enabled: true` is still in both (pass 1 S8 residual).
- **Orphans:** dead thread-state key guidance in `docs/slack-thread-ids.md:43`.
- **Keep:** `docs/slack-search.md`, the github skill's structure and "Done when" checks, `plain-english`, the README Memory and patch sections, `web-page`.

| Where | Rule | What | Fix |
| --- | --- | --- | --- |
| `.env.example:26` | stale doc | incomplete. Without it the Home tab also drops the Connect GitHub button (`docs/github-app.md:110-112`) | name both consequences |
| `AGENTS.md:71` | single source of truth | caches numbers that `config.ts:63-70` already states (850,000, 65,536, 32,768) and covers only one of the two summarizer rungs (`providers.ts:98-103` also has `mimo-v2.5`, whose caps it never names) | keep the rule, point at config.ts for the numbers, cover every summarizer rung |
| `CODING_STANDARDS.md:54` | rule gap | no exemption for library-shaped signatures (`guardedFetch(input, init)` mirrors `fetch`, `MastraFilesystem` methods are positional), open since slopradar Q8 | add "except where the signature implements a library contract" |
| `CODING_STANDARDS.md:126` | single source of truth | type ownership is stated three times (lines 39-40, here, and the smells at 143-145) | keep the Types section, delete this bullet and the two smells |
| `CODING_STANDARDS.md:192` | single source of truth | this section and the `process.env`/secrets bullets at 176-186 restate AGENTS.md "Boundaries" and will drift | replace with one line pointing at AGENTS.md |
| `README.md:23` | stale doc | the per-thread override is gone (no `!display`, no `toolDisplay` in `threadStateSchema`; `processors/tool-display.ts:50` reads only `user_settings.tool_display`) | say "Tool display per person, set from the Home tab" |
| `README.md:113` | stale prerequisites | omits Node, but `package.json` engines requires `node >=24` and `bun run check:spelling` fails on Node 22.17 | add Node 24+ to the list |
| `README.md:159` | single source of truth | the same two-instance warning is in `AGENTS.md:72` and `docs/webhook-mode.md:127` | keep it in webhook-mode.md (the operator doc) and link to it here |
| `README.md:262` | stale doc | incomplete. `levelOutsideDM` (`lib/approval.ts`) turns "never ask" into ask-before-writing too, not only "ask before deleting" | say "in a shared thread a server set to never ask or to ask only before deleting asks before writing" |
| `docs/brokered-git.md:32` | stale doc | the row names only `asksBefore()`, but the shared-thread clamp described at line 19 is `levelOutsideDM()` in the same file, applied in `lib/github/access.ts` | list `levelOutsideDM()` and `lib/github/access.ts` |
| `docs/brokered-git.md:64` | finished history as live doc | a dated test log against template 2.0 that was never re-run on 2.2 | move the log to IMPLEMENTED.md (or re-run it), keep only the two lasting gotchas (Basic, not Bearer; no CA config) |
| `docs/slack-thread-ids.md:43` | stale doc | this branch no longer reads Chat SDK `thread-state:` keys (`MastraStateAdapter` is in-memory; gorkie state lives in Mastra `threadState`, already keyed by the Slack id, `chat/state.ts:8`) | say that, and that any rows main left behind are dead |
| `skills/67ify/SKILL.md:29` | step order | the privacy check comes after step 2 already uploaded the image | move "ask before sending a private or sensitive image" before step 2 |
| `skills/agent-browser/SKILL.md:5` | pointer wording | the description (line 3) spends ten trigger phrases on one branch ("open a website", "click a button", "fill out a form"...) and says "Prefer agent-browser over any built-in browser automation", but the live browser is gone so there is none | one trigger per branch (drive a web page; QA or dogfood), drop the "prefer" clause |
| `skills/agent-browser/SKILL.md:19` | contradicts the prompt | line 18 copies `prompts/core.ts:31` and line 20 says "narrate as you go" in text, which `core.ts:33-34` forbids (progress goes in `status_update`, never text); the "logging in" example also contradicts line 14 | delete lines 18 and 20 |
| `skills/agent-browser/SKILL.md:23` | single source of truth | lines 21 and 23 repeat `prompts/core.ts:35-36` and `prompts/features/sandbox.ts:15` | keep only the browser-specific rules (line 22, recording) |
| `skills/agent-browser/SKILL.md:48` | co-location | a Slack rule under "Specialized skills" that repeats line 14 | fold into the line 14 paragraph |
| `skills/agentmail/references/api.md:14` | single source of truth | lines 14-18 restate SKILL.md:10-13, 25 and 34 (placeholder, untrusted mail, label rule, admin ban) | keep them in SKILL.md only |
| `skills/agentmail/references/api.md:107` | no-op | filler the model already follows (x2 in this file, also line 155 "Use labels to keep inbox state understandable") | delete both sentences |
| `skills/agentmail/references/api.md:182` | hedged instruction | "when the SDK method supports request options... if the SDK version does not expose" gives the agent nothing to run | name the real `agentmail` Python parameter after checking the SDK, or delete the section |
| `skills/github/references/failures.md:15` | stale claim | deepening with `git fetch` only fails for private repositories; line 7 says a plain fetch of a public one works, so `git fetch --deepen` works there | qualify it as private repositories |
| `skills/mermaid-diagrams/SKILL.md:5` | pointer wording | the description (line 3) opens with "Comprehensive guide" and lists about 15 triggers including "model", "map out" and "any other diagram type", so it fires on ordinary explanations | one trigger per branch: a diagram as an image |
| `skills/mermaid-diagrams/SKILL.md:11` | sandbox fit | the `npx -y @mermaid-js/mermaid-cli` call below; mermaid-cli is not in the template (`build-template.ts:52` installs only agent-browser and wrangler) and `npx` pulls puppeteer plus its own Chromium on every new sandbox | preinstall it in the template, or point `PUPPETEER_EXECUTABLE_PATH` at the browser already installed |
| `skills/mermaid-diagrams/SKILL.md:18` | no-op | puffery ("professional", "version-controllable, easy to update, and maintainable") | delete the paragraph |
| `skills/mermaid-diagrams/SKILL.md:40` | unslop dash | hyphen standing in for a dash (x34 in this file) | colon |
| `skills/mermaid-diagrams/SKILL.md:148` | sprawl | about 2,900 lines of copied upstream Mermaid docs and generic examples (e-commerce, blog, social schemas) the agent can fetch from mermaid.js.org, several with wrong syntax (see annotations in references/) | keep a short gotchas file and link the docs |
| `skills/mermaid-diagrams/SKILL.md:161` | no-op | "Comment Extensively", "Version Control: store .mmd files alongside code" and the Exporting section (line 191, GitHub/Notion rendering) do not apply to a PNG posted in Slack | delete |
| `skills/mermaid-diagrams/SKILL.md:211` | over-trigger | "Always diagram when starting new projects... onboarding new team members" pushes unrequested diagrams into replies | delete the section |
| `skills/mermaid-diagrams/references/advanced-features.md:37` | unslop dash | hyphen standing in for a dash (x18 in this file) | colon |
| `skills/mermaid-diagrams/references/advanced-features.md:241` | wrong syntax | `%%{init}%%` directives must come before the diagram, here (and line 269) they sit at the end and are ignored; frontmatter replaces them anyway | move to the top or use frontmatter |
| `skills/mermaid-diagrams/references/advanced-features.md:274` | wrong example | the snippet shows no directional hint, only a comment | delete the section |
| `skills/mermaid-diagrams/references/advanced-features.md:307` | wrong syntax | `link A: ... @ url` is sequence-diagram syntax, not flowchart; click links and tooltips also do nothing in a PNG | delete "Click Events" and "Tooltips" |
| `skills/mermaid-diagrams/references/advanced-features.md:412` | no-op | HTML embedding, the `mermaid@10` CDN snippet and React integration (line 496 onward) do not apply to a PNG rendered with `mmdc`, and v10 lacks `architecture-beta` and `look` | delete these sections |
| `skills/mermaid-diagrams/references/architecture-diagrams.md:40` | wrong syntax | `redis` here, `browser` (line 61) and `load_balancer`/`api` (lines 143-144) are not default icons (line 92 lists cloud, database, disk, internet, server) and render as broken boxes | use default icons or an `--iconPacks` pack |
| `skills/mermaid-diagrams/references/c4-diagrams.md:7` | unslop dash | hyphen standing in for a dash (x18 in this file) | colon |
| `skills/mermaid-diagrams/references/class-diagrams.md:33` | unslop dash | hyphen standing in for a dash (x15 in this file) | colon |
| `skills/mermaid-diagrams/references/erd-diagrams.md:39` | unslop dash | hyphen standing in for a dash (x28 in this file) | colon |
| `skills/mermaid-diagrams/references/erd-diagrams.md:43` | wrong syntax | Mermaid ERD keys are only PK, FK and UK; `NN` fails to parse | delete it |
| `skills/mermaid-diagrams/references/erd-diagrams.md:53` | wrong syntax | `}{` is not a cardinality; one-or-many is `}\|` on the left and `\|{` on the right | fix the list |
| `skills/mermaid-diagrams/references/erd-diagrams.md:58` | wrong syntax doc | reversed. In Mermaid `--` (solid) is identifying and `..` (dashed) is non-identifying | swap |
| `skills/mermaid-diagrams/references/erd-diagrams.md:427` | wrong syntax | `uuid student_id FK PK` needs comma-separated keys, `PK, FK` | fix both lines |
| `skills/mermaid-diagrams/references/flowcharts.md:13` | unslop dash | hyphen standing in for a dash (x15 in this file) | colon |
| `skills/mermaid-diagrams/references/flowcharts.md:27` | wrong syntax doc | labels swapped, `([...])` is the stadium shape and `(...)` the rounded rectangle; line 408 inherits the error | swap the two headings |
| `skills/mermaid-diagrams/references/flowcharts.md:250` | wrong syntax | `[mid = low + (high - low) / 2]` and `{array[mid] == target?}` put brackets inside node labels, which breaks the parser | quote the labels: `["mid = low + (high - low) / 2"]` |
| `skills/mermaid-diagrams/references/sequence-diagrams.md:28` | unslop dash | hyphen standing in for a dash (x10 in this file) | colon |
| `skills/taste-skill/SKILL.md:11` | contradicts the prompt | `prompts/features/sandbox.ts:15` makes the screenshot the default deliverable and deploys only when a live link is wanted | say "deliver a screenshot; deploy with `web-page`/`wrangler` when they want a link" |
| `skills/taste-skill/SKILL.md:38` | unslop dash | hyphen standing in for a dash, against owner decision 16 and CODING_STANDARDS.md:160 (x20 in this file) | comma, colon before a list, or a new sentence |
| `skills/taste-skill/SKILL.md:154` | unverifiable rule | "different from your previous project" assumes cross-thread memory gorkie does not have (recall off, README:236); same at line 153, `type-color-layout.md:25,50` | delete the "previous project" clauses |
| `skills/taste-skill/references/ai-tells.md:28` | self-contradiction | "use organic, messy data (47.2%, a fake phone number)" invents precise figures that `assets-content.md:70-73` bans | delete this bullet |
| `skills/taste-skill/references/ai-tells.md:46` | unslop dash | hyphen standing in for a dash (x6 in this file) | comma or new sentence |
| `skills/taste-skill/references/ai-tells.md:53` | self-contradiction | allows "a simple arrow or Scroll" while line 92 bans scroll cues outright | keep line 92 only |
| `skills/taste-skill/references/ai-tells.md:59` | duplication | same rule as line 93 | keep one |
| `skills/taste-skill/references/ai-tells.md:63` | duplication | the em dash ban is restated here, in 9.G, `assets-content.md:80` and SKILL.md:145 | keep 9.G and the pre-flight line |
| `skills/taste-skill/references/architecture.md:10` | wrong default for this sandbox | React Server Components need a server runtime, but deploys go through `wrangler deploy --temporary` static assets or the single-file `web-page` skill | default to a static build (Vite) or one HTML file |
| `skills/taste-skill/references/architecture.md:16` | unslop dash | hyphen standing in for a dash (x10 in this file) | comma or new sentence |
| `skills/taste-skill/references/assets-content.md:12` | contradicts web-page skill | `picsum` and the Simple Icons CDN (line 20) are remote assets, which `web-page/SKILL.md:30-32` bans for single pages | say which wins (inline generated images for web-page) |
| `skills/taste-skill/references/assets-content.md:23` | self-contradiction | "make up an SVG mark" vs line 28 and SKILL.md:172 "NO hand-rolled decorative SVGs" | keep one rule |
| `skills/taste-skill/references/assets-content.md:41` | unslop dash | hyphen standing in for a dash (x5 in this file) | period |
| `skills/taste-skill/references/assets-content.md:85` | self-contradiction | both "quote" examples on this line are straight ASCII, and it contradicts unslop rule 19 (straight quotes) | delete or state one rule with the actual characters |
| `skills/taste-skill/references/design-systems.md:45` | puffery | "Real Source-Backed", "production reality, not training-data fiction" (line 47) and `liquid-glass.md:98` "reality anchors" say nothing the content does not | cut; the heading also uses a hyphen as a dash (x3 in this file) |
| `skills/taste-skill/references/motion.md:11` | unslop dash | hyphen standing in for a dash (x7 in this file) | comma or new sentence |
| `skills/taste-skill/references/motion.md:21` | self-contradiction | the 5.A and 5.B skeletons mix `GSAP` with Motion (`useReducedMotion` from `motion/react`), which `vocabulary.md:79` forbids | use `matchMedia('(prefers-reduced-motion: reduce)')` or relax the rule |
| `skills/taste-skill/references/redesign.md:10` | unslop dash | hyphen standing in for a dash (x18 in this file) | colon or comma |
| `skills/taste-skill/references/redesign.md:44` | invented numbers | the precise-looking figures this skill bans elsewhere (`assets-content.md:70`) | drop them |
| `skills/taste-skill/references/type-color-layout.md:18` | vague attribution | unsourced superlatives ("most-tested in production rounds", "#1 violated rule in production tests" line 97, `ai-tells.md:97`, `redesign.md:24`) and line 41 "every premium-consumer site you have ever shipped" | delete the claims, keep the rules |
| `skills/taste-skill/references/vocabulary.md:10` | unslop dash | hyphen standing in for a dash (x50 in this file) | colon after each name |
| `skills/unslop/SKILL.md:5` | duplication | the body is byte for byte `.agents/skills/unslop/SKILL.md` (only the description differs), so the two copies will drift | keep this runtime copy and symlink the dev one to it |
| `skills/wrangler/SKILL.md:8` | single source of truth | "retrieval first" is said five times (here, line 30, line 75, `operations.md:3`, `config-and-bindings.md:7`) | keep the Retrieval Sources table, drop the rest |
| `skills/wrangler/SKILL.md:13` | duplication | line 12 already gives `wrangler deploy --temporary`, then line 14 opens with "Instead use" for the same thing | merge into one paragraph |
| `skills/wrangler/SKILL.md:38` | unclear name | "Search tool" | name `search_web` / `fetch_url` |
| `skills/wrangler/SKILL.md:85` | no-op | with no account there is no API token, so raw API calls cannot happen | delete the item |
| `skills/wrangler/references/config-and-bindings.md:13` | wrong path | wrangler is global, so `./node_modules/wrangler/...` in this block (line 15) and line 84 does not exist | use `/usr/local/lib/node_modules/wrangler/config-schema.json` as SKILL.md:45 does |
| `skills/wrangler/references/config-and-bindings.md:14` | contradicts SKILL.md:85 | it says omit resource ids and let the deploy create them, this block hardcodes them (lines 28, 33, 38) | drop the `id` fields |
| `skills/wrangler/references/config-and-bindings.md:102` | unreachable without an account | `kv namespace create`, `d1 create/execute --remote`, `hyperdrive create`, `queues create` all need a logged-in account; `--temporary` only applies to `wrangler deploy` (SKILL.md:14) and login is banned, so these hang on the browser login | delete the management sections, keep config bindings that deploy provisions |
| `skills/wrangler/references/config-and-bindings.md:229` | secret in a command | `--origin-password "$DB_PASSWORD"` below; SKILL.md:86 bans secrets in commands, and a user-supplied DB password typed into the sandbox lands in traces | drop the Hyperdrive create example |
| `skills/wrangler/references/operations.md:46` | circular fix | if `wrangler` is not found, `wrangler --version` fails too | say it lives under `/usr/local/bin` (npm prefix in `build-template.ts`) and check `PATH` |

## Security findings

Each was checked in code on 2026-10-01 before recording. Pass 1 rows S1, S2, S4, S5, S6, S7, S10 and S12 were verified fixed and S11 and S13 went moot (`IMPLEMENTED.md` 2026-09-24); S14 stays accepted. Only open or changed rows are listed.

| # | Severity | Where | Finding | Status |
| --- | --- | --- | --- | --- |
| H1 | High | repo-root `trace-*.json` (6 files), `observability.duckdb`, `.mastra/output/observability.duckdb` | Old Slack bot tokens (two distinct `xoxb-` values, not the current one) captured through the channels render entry in `requestContext` before `slack-identity.ts:26` started dropping it (b48e2c27, 2026-09-24). Langfuse spans before that date likely hold them too. Files still present 2026-10-01. | Open, owner action: `auth.test` each token and revoke if live, delete the trace and DuckDB files, delete pre-2026-09-24 Langfuse traces. |
| S3 | Medium | `src/mastra/tools/github/git.ts:120,134`, `src/mastra/workspace/jobs.ts:47` | The `hasLiveJob` refusal only runs when `threadId` is passed (it is optional, and callers pass `channelContext(...).threadId`), and it is one-way: `startJob` never checks `credentialWindows`, so a `run_background` started during an open window runs with the user's token on github.com. A parallel foreground `execute_command` has the same gap. | Open (pass 1 residual). Fix: require `threadId`, refuse `startJob` while the sandbox has a window, document the foreground gap in `docs/brokered-git.md`. |
| M1 | Medium | channels `sendMessage` (`ifActive` default `deliver`) | A second person's message lands inside a running turn and runs with the first person's GitHub and MCP tools; shared-thread reads never ask. | Accepted by the owner 2026-10-01: writes need approval anyway. |
| M2 | Medium | `chat/commands/display.ts` (deleted) | Anyone could run `!display detailed` in a shared thread and see raw args and results of another person's credentialed tools. | Closed by removing `!display` (tool display is a per-user Home setting). Uncommitted. |
| P1 | Low | `src/mastra/tools/run-background.ts:30` | When the completion callback finds no saved channel (the task ended without `execute` storing one), the rebuilt context has no `userId`, so `claimTurn` is skipped and the wake runs outside the usage limit. | Open. Fix: log and return when `saved` is missing. |
| P2 | Low | `src/mastra/chat/feedback.ts:69` | A malformed feedback click logs `event.raw` at warn, which carries `response_url` (a 30-minute post credential) and `trigger_id`. Reachable only through our own bug or a stale button, since Slack signs the payload. | Open. Fix: log `actionId`, `value` and `userId` only. |
| S9 | Low | `src/mastra/server/oauth.ts:65` | Consumed OAuth start nonces live in the Chat state adapter, which is `MastraStateAdapter` in process memory, so a used start link can be replayed after a restart within its 10 minutes. | Open (pass 1 fix moved the nonce but not off memory). Fix: Postgres (Mastra `threadState` domain or a small table). |
| P3 | Low | `src/mastra/db/queries/usage.ts:66`, `src/mastra/db/queries/mcps.ts:93` | Both take `pg_advisory_xact_lock(hashtext(userId))`, so a turn claim and an MCP add for one user wait on each other. Availability only, no data exposure. | Open. Fix: two-key `lockUser({ tx, scope })`. |
| S8 | Low | `slack-manifest.json:96`, `slack-manifest.dev.json:96` | `is_mcp_enabled: true` has no consumer. | Open (pass 1 residual). |
| L1 | Low | dependencies | `bun audit`: 118 advisories (51 high, 0 critical); the server-facing one is hono below 4.12.34, not hit by our usage. | Open: bump with the next Mastra upgrade. |
| L2 | Low | `src/mastra/chat/moderation/index.ts:30-38` | `banStatus` returns `lookup-failed` on a DB error and callers only refuse `banned`, so bans fail open. | Open. |
| L3 | Low | GitHub install callback (`src/mastra/server/github.ts`, `server/oauth.ts`) | GitHub install state is reusable for 10 minutes; the only effect is an extra Home publish. | Open. |
| L4 | Low | `src/mastra/lib/crypto.ts` | AES-GCM secrets have no AAD binding to `userId`, so a sealed value copied between rows still decrypts. | Open. |
| L5 | Low | `.env` | Mode 0644. | Open: `chmod 600`. |
| S14 | Accepted | `src/mastra/mcp/security.ts` | DNS rebinding between `checkMCPUrl` and the fetch. | Accepted by the owner (no IP pinning). No action. |

Moved out of this table: the `.catch('all')` and `.catch('write')` permission schemas (`types/github.ts:27`, `types/mcp.ts:12`). A bad value cannot come from outside (radios offer only our values, Slack submissions are signature-verified), only from our own bug or a pre-deploy modal, so it is a Low code quality finding in the agents scope, band 1.

## Resolution order

1. Owner questions into `TODO.md` (done); leave dependent annotations in place until answered.
2. Security first: H1 owner actions, S3, P1, P2, S9, P3.
3. Correctness: `lib/github/api.ts:48`, the thread-state orphan migration, `chat/attachments.ts:45`, Mermaid syntax, agent-browser and taste-skill prompt contradictions, docs accuracy.
4. Then consolidation (user gate, channel gate, encodings, config moves), then simplification and the dash pass, one reviewable change each, each logged in `IMPLEMENTED.md`.
5. Verifier agents refute each resolution against the rule and the code.
6. Done when the grep above returns nothing and `bun run typecheck`, `bun run check` and `bun run check:spelling` pass. Then `/no-comments` over the resolution diff, and desloppify last.
