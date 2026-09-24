# Slopradar

Pass 1, 2026-09-24, branch `chore/quality-pass` (head `66467b65` at annotation time).

Rules measured against: `AGENTS.md`, `CODING_STANDARDS.md`, and the `code-review-and-quality`, `code-simplification` and `coding-best-practices` skills. Seven reviewers annotated every line in their scope with `TODO(slopradar)` comments and changed no code. This file compiles their reports. Phase 3 resolves the annotations band by band and logs each resolution in `IMPLEMENTED.md`; owner questions go to `TODO.md` under "Owner decisions from slopradar" first.

## Scores

Slop is 0 to 10, 10 worst. Counts are from `grep -rn "TODO(slopradar)"` after annotation.

| Scope | Slop | Annotations |
| --- | --- | --- |
| `src/mastra/chat/**` (except `live-view.ts`) | 3 | 33 |
| `src/mastra/tools/**` | 3 | 34 |
| `src/mastra/{lib,db,server,observability}/**`, `drizzle/**` (except the live-view server files) | 3 | 23 |
| `src/mastra/{mcp,workspace,processors,memory}/**` (except `workspace/browser.ts`) | 3 | 25 |
| `src/mastra/{agents,prompts,types}/**`, `src/env.ts`, `config.ts`, `providers.ts`, `scripts/**`, `drizzle.config.ts` | 4 | 41 |
| `workspace/**` (runtime skills), `docs/**`, `README.md`, `AGENTS.md`, `CODING_STANDARDS.md`, `.env.example` | 5 | 68 |
| Held back: `index.ts`, `chat/live-view.ts`, `server/live-view.ts`, `server/page.ts`, `workspace/browser.ts` | 3 | 20 |
| **Total** | | **244** |

Reconciling the count: the reviewers reported 241. The held-back reviewer reported 17 but its files hold 20. The brief's grep command (`src scripts workspace docs README.md AGENTS.md CODING_STANDARDS.md .env.example drizzle`) returns 243; the extra one is in `drizzle.config.ts`, which that command does not cover. Manifests, `package.json` and `patches/` cannot hold comments; their findings are listed below instead.

## Cross-scope patterns

1. **Hand-written versions of what a library already does.** Grouping MCP tools by server from name prefixes (`listToolsetsWithErrors` groups them); disconnecting a stale `MCPClient` by hand (the constructor does it); a second `LangfuseClient` (`LangfuseExporter.client` exists); an in-memory nonce `Map` (the Chat state adapter has `setIfNotExists`); a custom `closed` hook that misses Mastra's `onBrowserClosed`.
2. **Check-then-act races across awaits.** Usage limit check vs record (`chat/usage.ts`, `db/queries/usage.ts`); thread state read-modify-write (`chat/state.ts`); two concurrent live-view connects posting two cards (`workspace/browser.ts:161`, `chat/live-view.ts:84`); a refresh landing after "session ended" (`chat/live-view.ts:70`).
3. **The same literal or shape defined in several places.** Three mention regexes; `'dm' | 'threads'` and its radio labels in four files; ban durations; OAuth status keys; the focus filter, repo-access lookup and scheduler wake payload copied between tools; `ChannelContext` beside `channelSchema`; the narration and screenshot rules repeated four to five times across prompts; `sandboxPath` renamed `p` in five importers.
4. **Work done on every turn or every call that could be done once.** Thread state read up to five times per subscribed message; four settings queries for one row; an E2B `setTimeout` call before every workspace tool call; a Python start per `agent-browser` call in `stealth-browser.sh`.
5. **Slack's 3 second ack window.** Modal submit handlers await `publishHome` (DB reads, GitHub token refresh, GitHub `/user/installations`) before Chat SDK answers Slack.
6. **One failure taking down unrelated work.** One MCP server throw rejects the whole client build; one unwrapped Home section fails the whole tab (`app-home/view.ts:91`).
7. **Imported skills not adapted to gorkie's sandbox.** agent-browser, wrangler, mermaid-diagrams, taste-skill and the AgentMail references carry account-only commands, unreachable ports and install steps that break the sandbox.
8. **Finished migrations still written as live instructions** in `docs/` (Socket Mode cutover, device flow, classic tokens, thread-id runbook, template 2.0).

## Owner questions

Rulebook contradictions and "change the code or change the rule" calls. Resolve these before the bands that depend on them.

1. **Extract vs inline.** CODING_STANDARDS "no large inline closures, move to a named function" and the code-simplification skill ("extract predicates, split functions over 50 lines") conflict with "inline over extract / no one-use helpers". Examples on the line: `downloadSlackFile`, `uploadToSlack`, `search-slack` `toOutput`, `titleFor`, `compactThread`, `filesSection`. Which wins?
2. **Which comments may stay.** The owner's working rule this session was "comments only for vendor or platform facts". CODING_STANDARDS allows any non-obvious why, and also requires a comment on every fire-and-forget promise and every intentionally ignored catch. Several annotations ask for such comments.
3. **Where types live.** AGENTS.md says types live in `src/mastra/types/`; CODING_STANDARDS says a private single-file shape stays inline. About 25 types in `types/` have one consumer (`ThreadOnlyChannelContext`, `SlackId`, `MemberLeftEvent`, `GitHubAccess`, `BanStatus`, `TurnClaim`, `BackgroundJob`, and others). Move them back inline, or change the rule?
4. **One-use tunable values.** "No one-use constants" vs "deployment-tunable values go in `config.ts`" (examples: `cpuCount`, `memoryMB`, the 24h prune interval, `cleanupIntervalMs`).
5. **`process.env` outside `env.ts`.** `drizzle.config.ts` reads `process.env.DATABASE_URL` (owner-approved earlier; importing `env` would require every bot secret for `db:generate`). Write the exception into the rule. Related: `OPENCODE_API_KEY` is validated in `env.ts` but read by Mastra's model router from `process.env` itself; pass it explicitly or document it.
6. **History backfill.** AGENTS.md and CODING_STANDARDS say never hand-roll history fetch, but `threadContext.maxMessages: 0` turns channels' version off and `chat/history.ts` does it by hand (channels only backfills on the first mention). Write the exception into the rule, or go back to channels?
7. **Slack modal rules.** The CODING_STANDARDS modal section describes raw Bolt `views.update` with `hash`; the code uses Chat SDK modals and `publishHomeView`, which takes no hash. Change the rule or accept last-write-wins (each publish rebuilds from the DB)?
8. **Dict params vs library signatures.** `guardedFetch(input, init)` must look like `fetch`; `MastraFilesystem` methods are positional. Add an explicit exemption.
9. **"Never fabricate data".** `E2BFilesystem.stat` sets `createdAt` to the modified time because `FileStat` requires it. Allowed at a library contract?
10. **Delete dead code or ask first.** `code-review-and-quality` says ask before deleting; CODING_STANDARDS says delete dead wrappers.
11. **Output cap rule.** AGENTS.md names `gemini-3.5-flash-lite` as the smallest output cap, but that model is now only the summarizer's, and `agent.maxTokens.output` equals 65,536 rather than sitting under it. Also `mimo-v2.5`'s context window could not be checked offline.
12. **Skill style conflicts.** `unslop` bans parentheses and hyphens used as dashes; `plain-english:23` teaches a parenthetical gloss; taste-skill `ai-tells.md:59` says to use a hyphen.
13. **Squash the migration chain?** This branch adds many drizzle migrations (including `github_dm_only_last_error` dropping `github_threads` and `github_mcp_threads` re-adding it, which wipes opt-ins). If no database that matters has run them, squash before merge; otherwise keep them as history.
14. **Stale skill path.** `coding-best-practices` rule 12 points at `apps/bot/src/config.ts`; the real file is `src/mastra/config.ts`.
15. **Stale AGENTS.md pointer.** The `/stay-within-limits` block names a skill that does not exist in the repo.

Dropped as false: several reviewers reported that `.claude/CLAUDE.md` says Socket Mode. `.claude/CLAUDE.md` is a symlink to `AGENTS.md`, and neither file mentions Socket Mode; the reviewers read a stale copy loaded into their context at session start.

## Security findings

Each was checked in code before recording.

| # | Severity | Where | Finding | Status |
| --- | --- | --- | --- | --- |
| S1 | Medium | `src/mastra/index.ts:118` (schedules `prepare`) | Returns `undefined` when the creator cannot be resolved; per `@mastra/core` `schedules/types.d.ts:158` only `null` skips, so the fire runs with no ban check and no usage claim. | Open. Fix: return `null` in both skip paths. |
| S2 | Medium | `src/mastra/workspace/index.ts:145` | Runs without a `threadId` map to one shared `__unscoped__` sandbox. `requireSandbox` refuses it, but Mastra's own workspace tools resolve through `workspace.resolveSandbox` and are not gated, so two unscoped runs share a VM and its files. | Open (also listed in `IMPLEMENTED.md`). Fix: refuse in `beforeToolCall` when the key is unscoped. |
| S3 | Medium | `src/mastra/tools/github/git.ts:118` | The github.com `Authorization` rule covers the whole sandbox during a credential window, so a concurrent `run_background` job or parallel `execute_command` can push with the user's token, skipping approval and the default-branch refusal. | Open, tied to the sandbox egress decision (Q3). Fix: refuse to open the window while the sandbox has a live background job. |
| S4 | Medium | `workspace/skills/agentmail/SKILL.md:8` | One AgentMail inbox shared by every Slack user: anyone can read or reply to mail from someone else's task; inbound email bodies are not called untrusted; any user can send mail as gorkie with no confirmation. | Open. |
| S5 | Medium | `workspace/skills/agentmail/references/webhooks.md`, `api.md:16,89,206` | Webhooks to a user-supplied URL would forward all inbound mail; the API reference shows org-wide reads and pod administration (deletes, keys) that `prompts/guardrails.ts` refuses. | Open. Fix: delete `webhooks.md` and `websockets.md`, trim `api.md`. |
| S6 | Medium | `workspace/skills/agent-browser/SKILL.md:14,25` | "Log in with credentials you have" invites passwords pasted into Slack (which land in memory and traces); payments are a routine screenshot step with no confirmation. | Open. |
| S7 | Low | `workspace/skills/artifacts/SKILL.md:25` | The public-URL warning only covers DMs; private channel content is just as private. | Open. |
| S8 | Low | `slack-manifest.json`, `slack-manifest.dev.json` | Bot scopes the code never uses: `calls:read`, `dnd:read`, `lists:read`, `reminders:read`, `remote_files:read`, `team.billing:read`, `team.preferences:read`, `users:read.email`, `search:read.files`, `search:read.public` (search runs on the user token). `link_shared` is subscribed only because Slack requires it for `unfurl_domains`; `is_mcp_enabled: true` has no consumer. | Open. Keep `link_shared`. |
| S9 | Low | `src/mastra/server/oauth.ts:45` | Used OAuth start nonces live in an in-memory `Map`; after a restart a used link can be replayed within its 10 minutes. | Previously accepted as single-process design; reviewer suggests `setIfNotExists` on the Chat state adapter. Owner call. |
| S10 | Low | `src/mastra/mcp/errors.ts:50` | `advertisesOAuth` uses raw `fetch` instead of `guardedFetch` and caches `true` in an unbounded Map keyed by user URLs. | Open. |
| S11 | Low | `src/mastra/workspace/build-template.ts:55` | `cloakserve` is downloaded from a mutable git tag with no checksum. | Open. Fix: pin a commit and check a hash. |
| S12 | Low | `src/mastra/lib/crypto.ts:121` | If the signer rejected its own state, `signOAuthToken` falls back to an empty nonce. Fails closed, but should throw. | Open. |
| S13 | Info | `src/mastra/index.ts` (live-view middleware) | Ticket checked only when the WebSocket opens, so an open viewer outlives the 10-minute expiry; the guard relies on `HOST=127.0.0.1` and the tunnel setting `cf-connecting-ip` or `x-forwarded-for`. A proxy that sets neither exposes operator routes. | Record the assumption in `docs/webhook-mode.md`. |
| S14 | Accepted | `src/mastra/mcp/security.ts:49` | DNS rebinding between `checkMCPUrl` and the fetch or transport. | Previously accepted by the owner (`IMPLEMENTED.md`: no IP pinning, Cloudflare rotates IPs). No action. |

Cleared by the reviewers (verified): Slack channel gates (`assertReadableChannel`, `readableFile`, `assertCanPostTo`, `assertCanManageChannel`), `call_slack_api` allowlist and auth-param refusal, `search_slack` scope check, emoji CDN pin, `fetchPrivateSlackFile` with manual redirects, git config pins in the credential window, scheduled-task owner check, OAuth nonce plus cookie with `timingSafeEqual`, `slack-identity.ts` dropping `requestContext` from spans, pino and octokit redaction, core approval patch failing closed, watch-only live view (no-op input overrides, tested against Mastra's handler), moderator re-checks, `response_url` pinned to `hooks.slack.com`.

## Per scope

### chat (33, slop 3)

- **Patterns:** awaited `publishHome` in modal submits (3 s window); repeated per-turn reads (thread state up to 5 times, `memoryThread` twice, `withHistory` pages Slack before the cheap checks); literals in several places (mention regexes, `'dm' | 'threads'`, ban durations, OAuth status keys); two swallowed catches (`adapter.ts:66`, `names.ts:51`) and one uncommented fire-and-forget (`moderation/index.ts:93`).
- **Structure:** right. `adapter.ts` fills verified gaps (recipient cache, member-left, unthreaded root guard, lookup dedupe and rate limit); `history.ts` fills a real gap. Smell: `PublishHome` passed into every section's register function only to avoid an import loop.
- **Bands:**
  1. Modal submit acknowledgements: `app-home/mcp/actions.ts:83,218`, `app-home/github/actions.ts:36`, `app-home/instructions/actions.ts:49`.
  2. Correctness: `app-home/view.ts:91` (unwrapped Home section), `adapter.ts:255` (override drops `<#C...>` channel-name resolution), `attachments.ts:33` (model told to use a file id it is not given), `app-home/mcp/actions.ts:123` (Add silently does nothing at the limit).
  3. Turn pipeline performance: `handlers.ts:153,228`, `names.ts:21`.
  4. Concurrency (owner call): `state.ts:64`, `usage.ts:12`.
  5. One canonical source: `adapter.ts:6`, `app-home/mcp/actions.ts:170`, `app-home/mcp/blocks.ts:6`, `moderation/commands.ts:73,97`, `app-home/view.ts:132`.
  6. Error handling: `adapter.ts:66`, `names.ts:51`, `moderation/index.ts:93`.
  7. Simplification and dead code: `status/index.ts:24` (dead `agent-research_*` branch; Mastra names subagent tools `agent-${name}`), `moderation/index.ts:36`, `moderation/commands.ts:11`, `adapter.ts:59`, `history.ts:51,75`, `focus.ts:43`, `feedback.ts:120`, `onboarding.ts:48`, `app-home/index.ts:16`, `app-home/mcp/actions.ts:41`.
- **Orphans:** the dead `status/index.ts` branch; the opt-in button's unused `value`.
- **Keep:** `turn-drain.ts` (its biome-ignore), the `DEFAULT_INLINE_MEDIA_TYPES` copy (core does not export it), `title.ts` placeholder check, the `response_url` fetch, the statuses table, `mastra-instance.ts`, `compact.ts`, `stop.ts`, `limit.ts`, `content.ts`, `message.ts`.

### tools (34, slop 3)

- **Patterns:** copied blocks (focus filter, token plus repo access lookup, scheduler wake payload); `sandboxPath` aliased to `p` in five files; dead fallbacks (`split('/').pop() ?? x`, an always-true `ok`); `readableFile` returns `file` as optional so six call sites use needless optional chaining; two swallowed catches.
- **Structure:** right: one file per tool, `slack/utils.ts` as the shared security layer, `toolsets.ts` the only registry. Small misplacements: the wait marker lives in `scheduled-tasks/queries.ts`; `code-mode/slack.ts` exports four one-line wrappers around a boolean.
- **Bands:**
  1. Correctness: `slack/get-slack-file.ts:88` (reuses a download matched by name and size, not file id), `generate-image/request.ts:62` (non-image reference labelled `image/png`; use `viewableImageType`), `generate-image/request.ts:68` (no abort or timeout), `slack/utils.ts:181` (`joinedChannels` never cleared).
  2. `readableFile` returns `file` as required: `slack/utils.ts:77`.
  3. Shared helpers: `slack/read-conversation-history.ts:89`, `slack/summarize-thread.ts:58`, `github/checkout.ts:12`, `github/push.ts:22`, `wait.ts:49`.
  4. Drop the `p` alias: `artifacts.ts:7`, `slack/call-api.ts:11`, `slack/get-slack-file.ts:7`, `slack/get-slack-emoji.ts:8`, `generate-image/index.ts:5`.
  5. Dead code: `search-web.ts:19`, `slack/call-api.ts:167`, `upload-emoji.ts:74`, `slack/upload-file.ts:37`, `github/git.ts:45`.
  6. Inline or collapse: `artifacts.ts:15,79`, `run-background.ts:22`, `code-mode/slack.ts:120,152`, `canvas/sections.ts:44`, `scheduled-tasks/queries.ts:9`, `focus.ts:13`.
  7. Catches and invented values: `slack/get-slack-file.ts:78`, `scheduled-tasks/create.ts:23`, `github/index.ts:91`.
  8. Owner call: simplify the resumable download (`slack/get-slack-file.ts:57`, about 100 lines); should `##` side comments reach the summarizer (`slack/summarize-thread.ts:53`)?
  9. Security S3: `github/git.ts:118`.
- **Orphans:** none.
- **Keep:** `git.ts` pins, `oneWindowPerSandbox` and fatal teardown; `search-slack.ts` `assertPublicOnly`; `call-api.ts` per-method schema map; `run-background.ts` `wakeChannels`; `upload-file.ts` truncation check; code mode's read-only MCP filter; the `outputSchema` plus `transform.display` pattern.

### lib, db, server, observability, drizzle (23, slop 3)

- **Patterns:** the same shape per column (four `user_settings` getters and four upserts; the Home view runs four queries for one row); library pieces rewritten (nonce Map, `toolCall`, second `LangfuseClient`, a retry matcher that equals Mastra's defaults); modules in the wrong place.
- **Structure:** mostly right. Exceptions: `lib/allowed-users.ts` imports `chat/client` and wires Slack events, so it belongs in `chat/`; the migration chain (owner question 13).
- **Bands:**
  1. Dead config: `lib/error-handling.ts:53,55`, `observability/trim-payloads.ts:3,9`, `lib/crypto.ts:121`.
  2. Moves and renames: `lib/context.ts:6` (to `types/channel.ts`), `lib/logger/slack.ts:6`, `lib/label.ts:1`, `lib/utils.ts:1` (rename to `shell.ts`), `lib/github/index.ts:1` (barrel everywhere or nowhere), `lib/allowed-users.ts:3` (to `chat/`).
  3. Settings consolidation: `db/queries/settings.ts:12,22`.
  4. Library pieces: `lib/tools.ts:3` (`hasToolCall` matches calls, not results: check first), `observability/langfuse-feedback.ts:13`, `server/oauth.ts:45`.
  5. Correctness: `db/queries/usage.ts:51` (race), `server/oauth-link.ts:26` (`undefined/...` URL when `PUBLIC_BASE_URL` is unset), `drizzle/20260924024825_slack_memory_thread_ids/migration.sql:43` (orphaned thread-state rows).
  6. Owner calls: `lib/crypto.ts:80` (drop v1 decryption: v1 never shipped and boot reseals every row), `drizzle/20260911221459_baseline/migration.sql:1` (squash), `drizzle/20260924053636_github_dm_only_last_error/migration.sql:2`, `lib/logger/index.ts:5` (log level into config).
- **Orphans:** none; the v1 decrypt path is effectively dead.
- **Keep:** key rotation and resealing, GitHub token refresh dedupe, per-request `githubAccess` caching, advisory-locked `insertMCPServer`, `slack-identity.ts`, `model-errors.ts`, the Exa timeout, `ids.ts`, `approval.ts`, the `mcp_oauth` cascade.

### mcp, workspace, processors, memory (25, slop 3)

- **Patterns:** library work redone (server grouping, client disconnect, no `walk` for `list_files`); one failure spreading (`user-servers/client.ts:65`, likely triggered by `oauth.ts:198`); stored data parsed without a schema (`oauth.ts:91`, `delegated-tools.ts:27`); per-call network overhead (`workspace/index.ts:187`, `filesystem.ts:167`).
- **Structure:** right. Misplacement: `unlabelledServers` lives in `approval.ts` but is written by `tools.ts` and read by Home, and is memory-only.
- **Bands:**
  1. Security S2: `workspace/index.ts:145,170` (move the `beforeToolCall` closure to module scope).
  2. MCP client robustness: `user-servers/client.ts:65,55`, `oauth.ts:198,91`, `user-servers/probe.ts:16`.
  3. Library grouping: `user-servers/tools.ts:26`, `user-servers/approval.ts:6` (persisting the flag is a schema change: ask).
  4. Outbound fetch hardening: `security.ts:49` (accepted, S14), `errors.ts:50` (S10).
  5. Sandbox performance: `workspace/index.ts:187`, `filesystem.ts:167,415`.
  6. Readability: `oauth.ts:125`, `filesystem.ts:151`, `jobs.ts:12,101`, `processors/step-guard.ts:16`, `processors/turn-footer.ts:18`, `processors/delegated-tools.ts:27`, `memory/profile.ts:3`.
  7. Template and config: `workspace/sandbox.ts:26`, `workspace/build-template.ts:55` (S11), `build-template.ts:76`.
- **Orphans:** `git config --global user.*` in `build-template.ts:68-69` (overridden by `GIT_*` env); `readdir`'s recursive branch may be unused once `walk` exists; the root-level browser binary download in the template looks redundant with the user-level one.
- **Keep:** `ripgrep.ts`, `tool-media.ts`, `tool-search.ts`, `tool-display.ts` vendor comment and render key, `stale-messages.ts`, `output-budget.ts`, `working-model.ts`, `describeMCPError` redaction, refresh-first `revokeMCPOAuth`, the partial-listing cache, PID parsing from `execute_command` output.

### agents, prompts, types, root, scripts (41, slop 4)

- **Patterns:** prompt copy duplicated (narration rule 4 to 5 times, screenshot rule 4 times, clashing with "never expose chain-of-thought"); prompt text outside `prompts/` (MCP and user-instructions blocks, memory instructions, the summarizer prompt); values that belong in config; shapes defined twice (`ChannelContext` vs `channelSchema`, `MastraStopCondition`).
- **Structure:** mostly right; the system prompt is assembled in two places (`prompts/index.ts` and `orchestratorInstructions`), and the settings copied into three agents have drifted (`research` has no `topP`).
- **Bands:**
  1. Bugs: `agents/research.ts:70`, `agents/explore.ts:67` (subagents run the `sandbox` output processor on the parent's thread, closing the live view mid-turn and pausing the sandbox); `config.ts:64` (950,000 input plus 65,536 output exceeds the 1M context of `glm-5.3-flash` and `deepseek-v4-flash-vision-exp`); `agents/research.ts:35`, `agents/explore.ts:29` (subagent `InMemoryStore` threads never cleaned); `providers.ts:46` (a rung that answers once is pinned for everyone for 5 minutes); script failure paths `scripts/dev-e2e.sh:23,33`, `scripts/verify-mastra-patch.ts:7,26`, `scripts/postbuild.ts:16`.
  2. Dead settings: `maxRetries: 5` at `agents/orchestrator.ts:158`, `research.ts:61`, `explore.ts:57` (every ladder entry sets 3 and wins); `providers.ts:74` stale comment; `orchestrator.ts:259` issue number in a comment.
  3. One prompt assembler: `orchestrator.ts:59,269`, `prompts/index.ts:11`, `agents/summarizer.ts:12`, `prompts/tools.ts:1`.
  4. Duplicated prompt copy: `prompts/core.ts:3,4`, `prompts/guardrails.ts:1`, `prompts/slack.ts:1`, `prompts/features/sandbox.ts:1`, `prompts/features/code-mode.ts:3`. Also the AgentMail address claimed unconditionally though `AGENTMAIL_API_KEY` is optional.
  5. Config and names: `config.ts:62`, `agents/summarizer.ts:9`, `orchestrator.ts:69,241`, `providers.ts:92`, `env.ts:42,47,59`.
  6. Shared agent setup: `research.ts:50`, `explore.ts:37`.
  7. Types: `types/agent.ts:1`, `types/channel.ts:3`, `types/thread.ts:15`, `drizzle.config.ts:19`.
- **Report-only (no comments possible):** `package.json` `check:unsafe` runs `ultracite fix --unsafe` (misleading name); `dev:tunnel` repeats `dev-e2e.sh:46`; `@vercel/connect` has no import in `src` but is an optional peer referenced by `@github-tools/sdk` (confirm before removing: dependency change). Patches: all three correct; coverage gaps flagged in `verify-mastra-patch.ts`.
- **Keep:** the three patches, vendor comments in `config.ts`, the permission schemas (`.catch('all')` falls back strictest), `env.ts` production checks, the research and explore prompts.

### runtime skills, docs, rules (68, slop 5)

- **Patterns:** imported skills not adapted (see cross-scope 7); docs behind the code (`post_message` described as reaching other channels at `README.md:47` and `topic-summaries/SKILL.md:40`; tunnel route list wrong at `README.md:141` and `.env.example:17`; `docs/brokered-git.md:19` says checkout always asks in shared threads, it only asks for private repos; the github skill says access cannot be checked before a push); finished migrations kept as instructions.
- **Structure:** right. Ownership wrong in three places: `unslop` duplicated byte for byte from the dev skill; `mermaid-diagrams/README.md` orphaned; "artifact" names both a skill (HTML page) and the `save_artifact`/`read_artifact` tools.
- **Correctness:** `agentmail/references/websockets.md` cannot work (SDK uses `wss://ws.agentmail.to`, the credential rule only rewrites `api.agentmail.to`); `agent-browser/SKILL.md:10` `npm i -g agent-browser` would overwrite the CloakBrowser wrapper.
- **Bands:**
  1. Skill security (S4 to S7): `agentmail/SKILL.md:8,20,71`, delete `agentmail/references/webhooks.md` and `websockets.md`, `agentmail/references/api.md:16,89,206`, `agent-browser/SKILL.md:14,25`, `artifacts/SKILL.md:25`; separately trim manifest scopes (S8).
  2. Fit the sandbox: `agent-browser/SKILL.md:10,18,52,79`, `wrangler/SKILL.md:35,38,50,82`, `wrangler/references/operations.md:1,184`, `mermaid-diagrams/SKILL.md:6`, delete `mermaid-diagrams/README.md`, `taste-skill/SKILL.md:6`, `67ify/SKILL.md:6,15`, `voice/SKILL.md:62`.
  3. Accuracy: `README.md:47,58,82,141,154,188,329`, `topic-summaries/SKILL.md:17,40`, `github/SKILL.md:36`, `github/references/failures.md:7`, `github/references/connecting.md:22`, `docs/brokered-git.md:19,65`, `.env.example:17,20,92`.
  4. Move finished migrations to `IMPLEMENTED.md`: `docs/webhook-mode.md:37,124,128`, `docs/github-app.md:118,144,155`, `docs/slack-thread-ids.md:72`, `README.md:73`.
  5. Rulebook (after owner questions): `AGENTS.md:39,44,63,66,84,97`, `CODING_STANDARDS.md:167,170,182,189`.
  6. `workspace/stealth-browser.sh:2,13` (drop the per-session cache key loop; cache the resolved binary path).
- **Orphans:** `mermaid-diagrams/README.md`; the AGENTS.md `/stay-within-limits` pointer; `gorkie-monitor.sh` and `gorkie.service` referenced in `docs/webhook-mode.md` but not in the repo.
- **Keep:** `docs/slack-search.md`; the public-surface and cloudflared sections of `docs/webhook-mode.md`; the github skill's structure and "Done when" checks; `plain-english`; the README Memory and patch sections.

### held-back files (20, slop 3)

- **Patterns:** check-then-act races around the live-view card; a custom `closed` hook where Mastra's per-thread `onBrowserClosed` already fires on disconnects too (today a sandbox pause or browser crash leaves the card refreshing forever and blocks any later card); errors treated as one kind (`chat/live-view.ts:24,106`, `server/live-view.ts:78`); the agent's browser tool call waits on Slack posts with 5 retries of 15 s each (`workspace/browser.ts:199`).
- **Structure:** right: `server/live-view.ts` owns routes, `chat/live-view.ts` the card, `workspace/browser.ts` the CDP connection. Misplaced: the schedules `prepare` closure inside the config literal in `index.ts`.
- **Bands:**
  1. Card lifecycle: `chat/live-view.ts:84,152`, `workspace/browser.ts:155,161,199` (register `onBrowserClosed`, in-flight connect map, post the card fire-and-forget).
  2. Refresh redesign: `chat/live-view.ts:26,57,70,118`. Every 15 s refresh rewrites the video block with a new ticket URL, which likely reloads Slack's player. Recommended: video cards sign one ticket at start and are not updated until the turn ends (poster frame goes stale); image-fallback cards keep refreshing and re-sign only near the 10-minute expiry; change the copy to "view only". For turns over 10 minutes, a separate HMAC ticket valid while the thread's browser session runs (hard cap about 1 hour), without stretching the factory signer that also guards OAuth.
  3. Block hardening: `chat/live-view.ts:24,30,106` (cap `alt_text`, fall back only on `invalid_blocks`, drop a dead `.catch`).
  4. Schedule gate (S1): `index.ts:115,118,130`.
  5. Small simplifications: `server/live-view.ts:10,19,78`, `workspace/browser.ts:240` (the `getCurrentUrl` override equals the inherited method).
  6. Owner call: `index.ts:38` exit or keep running after an uncaught exception.
- **Orphans:** the `getCurrentUrl` override.
- **Keep:** the dummy `executablePath` that stops Chrome on the host, the no-op input overrides, the skip for sandboxes without a traffic token, the `getCdpUrl` loopback override, the per-thread fingerprint seed, the CSP with nonce and Slack-only framing, the DuckDB fallback and pruning, the post-init channels wiring.

## Resolution order

1. Owner questions above into `TODO.md` ("Owner decisions from slopradar"); leave dependent annotations in place until answered.
2. Correctness and security bands first: subagent `sandbox` processor, context overflow, S1, S2, the tools correctness band, chat correctness band, MCP client robustness, live-view card lifecycle and refresh, skill security.
3. Then accuracy (docs, skills, prompts), then consolidation and simplification bands, one reviewable change each, each logged in `IMPLEMENTED.md`.
4. Verifier agents refute each resolution against the rule and the code.
5. Done when `grep -rn "TODO(slopradar)" src scripts workspace docs README.md AGENTS.md CODING_STANDARDS.md .env.example drizzle drizzle.config.ts` returns nothing and `bun run typecheck`, `bun run check` and `bun run check:spelling` pass. Then `/no-comments` over the resolution diff, and desloppify last.
