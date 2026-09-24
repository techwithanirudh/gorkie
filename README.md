<div align="center">
  <img alt="gorkie banner" src="./.github/banner.png" />
  <h1>gorkie</h1>
  <p>An AI assistant for Slack, built on Mastra.</p>
</div>

## Introduction

gorkie answers mentions, DMs, and subscribed threads, and runs code in a
sandbox to get those answers. It also runs recurring scheduled tasks on its
own.

The bot is a long-lived Bun process. [Mastra][mastra]'s built-in
[channels][channels] feature handles Slack events, wiring the [Vercel Chat
SDK][chat-sdk] Slack adapter in webhook mode while the agent runs on Mastra's
native runtime. Each Slack thread gets its own [E2B][e2b] sandbox, so gorkie
runs commands and inspects files without touching the host machine.

## Features

- Slack-native replies for mentions, DMs, and subscribed thread follow-ups,
  streamed into the thread as they generate, with a typing indicator.
- Tool display per person or per thread: Hidden (typing status only), Compact
  (one live checklist of tool calls per reply) or Detailed (a card per call),
  set from the Home tab or with `!display`.
- Thread commands: `!help`, `!stop`, `!compact`, `!display`, `!focus` and
  `!connections` (alias `!mcps`), handled before the agent runs
  (`chat/commands/`).
- Optional opt-in allowlist (`OPT_IN_CHANNEL`): gate access to members of one
  channel, with an in-Slack opt-in card for everyone else.
- Moderator bans: `/ban @user [1h|1d|7d|30d|perm] [reason]` and `/unban`,
  limited to `MODERATORS`, logged as cards with an Unban button in the
  gorkie-logs channel (`LOGS_CHANNEL`). A banned person is turned away
  everywhere, including tool approval buttons and their scheduled tasks.
- Per-thread [E2B][e2b] sandbox sessions: isolated cloud VMs, never the host.
  Full filesystem access (`read_file`/`write_file`/`edit_file`/`list_files`/
  `delete_file`/`file_stat`/`grep`) plus shell command execution
  (`execute_command`) with background process support (`get_process_output`,
  `kill_process`). `grep` runs one native `rg --json` call in the sandbox
  instead of Mastra's default of reading one file at a time, and `view_image`
  loads a sandbox image into the model's context.
- Delegated helper agents for research (Slack and web lookups) and codebase
  exploration (read-only workspace inspection), so multi-step digging stays
  out of the main conversation.
- Web search and page fetching via [Exa][exa], plus a Slack "code mode" tool
  for query-driven or exhaustive conversation analysis.
- Slack-native tools: read/summarize conversation history, search public
  channels (`search_slack`, see [docs/slack-search.md](docs/slack-search.md)),
  list threads and channels, inspect channels and users, post to another
  thread in this channel or DM the requester, upload and download files,
  react, join or leave a thread, and add custom emoji (`upload_emoji`, when
  `EMOJI_PROXY_TOKEN` is set). It reads only the current conversation and
  public channels.
- Slack Canvas tools: create, list, read, edit, and look up sections.
- Turn control: `skip` ends a turn without replying (acknowledgements, noise,
  messages meant for someone else), and `wait` resumes the thread later.
- Recurring scheduled tasks (cron-based, create/list/pause/resume/delete).
  Each run posts back into the conversation where it was scheduled.
- AI image generation, uploaded back into the Slack thread as a file.
- Less common tools load on demand through tool search, so the base tool
  list and the prompt stay small. The deferred set is `deferredTools` in
  [`tools/toolsets.ts`](./src/mastra/tools/toolsets.ts), plus a person's
  GitHub tools and their own MCP servers' tools
  (`processors/tool-search.ts`). A loaded tool unloads once Observational
  Memory observes the search that loaded it, and the model searches again.
- GitHub tools act as the connected person. They work in a DM with that
  person, and in shared threads only if they enabled shared threads in App
  Home, with approvals following their App Home settings (in a shared thread
  "never ask" falls back to asking before writing). Code changes go
  through `github_checkout` and `github_push_branch`, which borrow the person's
  token at the sandbox firewall for one git command; see
  [docs/brokered-git.md](./docs/brokered-git.md).
- [Observational Memory][om] compresses a long conversation into an
  observation log instead of carrying the full raw history, and working memory
  keeps each person's stated reply preferences. See [Memory](#memory).
- Runtime skills in [`workspace/skills/`](./workspace/skills/), loaded by the
  agent on demand. Two are not obvious from the name: `web-page` publishes a
  single HTML page on a temporary Cloudflare Worker, and `github` covers the
  checkout, push and pull request flow on top of the GitHub tools.
- Mastra Observability tracing exported to [Langfuse][langfuse], with each
  Slack thread as one Langfuse session and thumbs ratings sent as scores. In
  development, traces are also written to a local [DuckDB][duckdb] file
  (`observability.duckdb`).
- Per-person usage limits: 40 turns an hour and 300 a day (`usage` in
  [`config.ts`](./src/mastra/config.ts)), counted in `chat/usage.ts` and also
  applied to scheduled task runs. Moderators are exempt.
- Focus: the `focus` tool (and `!focus`) makes gorkie read and answer only
  named people in a thread; whoever brought it in and moderators still get
  through.
- Background jobs: `run_background` starts a long sandbox command and wakes
  the thread with its exit code and output when it finishes.
- Feedback: `submit_feedback` records bug reports, praise and requests about
  gorkie itself for the maintainers.

See [TODO.md](./TODO.md) for open work and known issues.

## Tech stack

- [Bun][bun] and TypeScript
- [Mastra][mastra], agent runtime + [channels][channels]
- [Vercel Chat SDK][chat-sdk] with `@chat-adapter/slack` (via Mastra channels)
- Model routing across the [Hack Club][hackclub] proxy and opencode.ai, which
  falls back per gateway when one fails
- [E2B][e2b] sandbox sessions
- [Exa][exa] for web search and page fetching
- [PostgreSQL][postgres] via `@mastra/pg`
- Mastra Observability, exported to [Langfuse][langfuse] (plus local
  [DuckDB][duckdb] in development)

## Getting started

Create a new [Slack app](https://api.slack.com/apps) from a manifest using
[`slack-manifest.json`](./slack-manifest.json), which sets the webhook request
URLs, the App Home, scopes, and event subscriptions. Replace `<your-host>` with
the public hostname in front of the bot (see [docs/webhook-mode.md](docs/webhook-mode.md)). You also need [Bun][bun], a
[PostgreSQL][postgres] database, an [E2B][e2b] API key, an [Exa][exa] API key,
and model keys for both [Hack Club][hackclub] and [OpenCode][opencode].

```bash
# Clone this repository
git clone https://github.com/techwithanirudh/gorkie.git

# Install dependencies
bun install

# Copy and fill in the environment (set PROJECT_ROOT to this repo's absolute path)
cp .env.example .env

# Build the configured E2B sandbox image
bun run build:template

# Run the bot locally (also serves Mastra Studio at http://localhost:4111)
bun run dev
```

Slack delivers events and interactivity over HTTP to
`/api/agents/orchestrator/channels/slack/webhook`, so local development needs a
tunnel. Create a second Slack app from
[`slack-manifest.dev.json`](./slack-manifest.dev.json) (`gorkie (dev)`), put its
bot token and signing secret in your local `.env`, set `GORKIE_API_TOKEN`
(`openssl rand -hex 32`), then:

```bash
# Starts mastra dev, waits for /health, then opens an untun tunnel
bun run dev:e2e

# Or run them separately
bun run dev
bun run dev:tunnel
```

Paste the printed tunnel host plus `/api/agents/orchestrator/channels/slack/webhook`
into both request URLs of the dev app (Event Subscriptions and Interactivity).
The tunnel URL changes on every run. Through the tunnel only the public routes
answer (the Slack webhook, `/health`, and the sign-in routes listed in [docs/webhook-mode.md](docs/webhook-mode.md#the-public-surface)); every
other route returns 404, and the rest of `/api` needs
`Authorization: Bearer $GORKIE_API_TOKEN` even on the host. The bot logs
`[agent] online` once channels are ready.

Never run two instances at once, dev against prod or two dev copies: they share
the Mastra scheduler, workers and the DuckDB lock, so scheduled tasks can fire
twice and one process loses local traces.

For a production-style run: `bun run build` then `bun run start`.

### Local Postgres database

The default `DATABASE_URL` in [`.env.example`](./.env.example) points at a
local database named `gorkie`. Every boot creates or upgrades Mastra's tables,
then applies gorkie's own migrations from [`drizzle/`](./drizzle/). To apply
them without starting the bot, run `bun run db:migrate`.

## Environment

| Variable | Required | Description |
|---|---|---|
| `PROJECT_ROOT` | yes | Absolute path to this repo. `mastra dev`/`start` run from `.mastra/output`, so migrations, skills, and the DuckDB file resolve against this instead of cwd |
| `SLACK_BOT_TOKEN` | yes | Bot User OAuth token (`xoxb-…`) |
| `SLACK_SIGNING_SECRET` | yes | Signing secret (Basic Information) used to verify Slack's webhook requests |
| `GORKIE_API_TOKEN` | production | 32+ character bearer token every non-public route requires (`openssl rand -hex 32`). Required in production and whenever tunnelling |
| `PUBLIC_BASE_URL` | for sign-in | Public https origin of the bot. GitHub and MCP OAuth sign-in redirect to `/oauth/<provider>/callback` under it |
| `HOST` / `PORT` | no | Bind address and port, default `127.0.0.1` / `4111`. Keep loopback; expose only through the tunnel |
| `SLACK_USER_TOKEN` | yes | Slack user token, not the bot token, used for public-channel search. Mint it with `search:read.public` only; gorkie verifies the granted scopes on first use and refuses the token if it also carries `search:read.im`, `search:read.mpim`, or `search:read.private`. See [docs/slack-search.md](docs/slack-search.md) |
| `OPT_IN_CHANNEL` | no | Slack channel id gating access to members only (opt-in allowlist); unset means everyone is allowed |
| `LOGS_CHANNEL` | no | Slack channel id of gorkie-logs, where ban and unban cards are posted. Unset still bans, but posts no cards |
| `MODERATORS` | no | Comma-separated Slack user ids allowed to `/ban` and `/unban`. Empty means nobody can ban |
| `HACKCLUB_API_KEY` | yes | Hack Club AI proxy key, tried for every model |
| `OPENCODE_API_KEY` | yes | opencode.ai/zen gateway key, tried alongside Hack Club |
| `DATABASE_URL` | yes | Postgres connection string |
| `LANGFUSE_PUBLIC_KEY` | yes | Langfuse public key. Tracing is the only production exporter, so the agent refuses to start without it |
| `LANGFUSE_SECRET_KEY` | yes | Langfuse secret key |
| `LANGFUSE_BASE_URL` | no | Self-hosted Langfuse only; defaults to `https://cloud.langfuse.com` |
| `E2B_API_KEY` | yes | E2B sandbox key (`e2b_…`) |
| `CREDENTIALS_KEY` | yes | Encrypts connected GitHub and MCP tokens at rest (`openssl rand -base64 32`) |
| `CREDENTIALS_KEY_PREVIOUS` | no | The old key during a rotation. Boot re-encrypts GitHub, MCP token and MCP sign-in rows with `CREDENTIALS_KEY`; remove it after one clean start. A secret neither key opens shows as disconnected and asks the person to reconnect |
| `GITHUB_APP_SLUG` | yes | The app's URL slug, used to link people to the install page |
| `GITHUB_APP_CLIENT_ID` | yes | GitHub App client id, for the App Home web sign-in (see [docs/github-app.md](./docs/github-app.md)) |
| `GITHUB_APP_CLIENT_SECRET` | yes | GitHub App client secret, for the sign-in code exchange, token refresh and revoking on disconnect |
| `EXA_API_KEY` | yes | Exa key, powers `search_web`/`fetch_url` |
| `AGENTMAIL_API_KEY` | no | Lets the sandbox reach the AgentMail API as `gorkie@agentmail.to`, without the key entering the sandbox |
| `EMOJI_PROXY_TOKEN` | no | Token for the Hack Club Slack emoji proxy. Enables `upload_emoji`; unset, the tool reports that emoji upload is not configured |
| `NODE_ENV` | no | `development` (default), `production` or `test`. Production requires `GORKIE_API_TOKEN`, rejects a non-https `PUBLIC_BASE_URL`, and skips the local DuckDB trace store |

See [`.env.example`](./.env.example) for the full annotated list.

## Memory

Three layers, each covering something different:

- **Unseen thread messages** ([`chat/history.ts`](./src/mastra/chat/history.ts))
  cover what was said in a Slack thread since gorkie last replied. Before a
  turn, it scans up to 30 recent messages back to `lastSeenMessage` and
  prepends up to 10 of them, leaving out `##` side comments and saying when
  older ones were cut. DMs skip this. Mastra's own channel thread context is off
  (`threadContext.maxMessages: 0`), so this is the only way unseen Slack
  messages reach the model. `lastSeenMessage` and `respondOnThreadMessages`
  live in Mastra's `threadState` storage on Postgres
  ([`chat/state.ts`](./src/mastra/chat/state.ts)), not Chat SDK thread state,
  which channels' `MastraStateAdapter` keeps only in process memory.
- **Mastra message history** is gorkie's own conversation in the thread: past
  turns, tool calls and results, stored in Postgres. It is capped by tokens
  (`messageHistory: { maxTokens: 200_000 }`), not a message count. Memory
  threads are stored under the Slack thread id (`slack:<channel>:<ts>`) through
  channels' `resolveThreadId`, the same id the sandbox, thread state and the
  Langfuse session use. A drizzle migration renames older UUID threads; see
  [docs/slack-thread-ids.md](./docs/slack-thread-ids.md) for the runbook.
- **Working and observational memory**
  ([`agents/orchestrator.ts`](./src/mastra/agents/orchestrator.ts)):
  - Working memory is scoped to the resource, the person who started the
    thread. It holds their stated reply preferences, such as style, format,
    language and timezone, and nothing else. The observer updates it only from
    that person's own messages, so someone else in a shared thread cannot
    rewrite it.
  - Observational memory is scoped to the thread. It compresses long threads
    into observations and reflections. Its `skillResultRedactor` hook strips
    skill bodies before observation, and the observer and reflector prompts
    treat quoted, fetched and tool-produced content as untrusted. Cross-thread
    `recall` is deliberately off: in a public bot it would let one thread read
    another person's DMs.

App Home custom instructions are separate from all three. They are stored per
user and injected as a `<user_instructions>` block on every turn.

## MCP servers and OAuth

People add their own MCP servers from the Home tab. A server that takes a
static token gets it as a bearer header. A server that advertises OAuth (RFC
9728 protected resource metadata) gets a Connect button instead: it opens
`/oauth/mcp/start`, which signs the person in with dynamic client registration
and PKCE through `@mastra/mcp`'s `MCPOAuthClientProvider`, and the callback at
`/oauth/mcp/callback` stores the tokens encrypted in `mcp_oauth`. Tokens refresh
shortly before they expire. A revoked or expired sign-in marks the server
"sign-in expired" and Gorkie stops connecting to it until the person presses
Reconnect. Every request the sign-in makes to URLs taken from the server's
metadata goes through the same private-address check as the server URL itself.
Needs `PUBLIC_BASE_URL`; without it OAuth servers show as not set up.

A person's servers load for their own messages in a DM with gorkie. In a shared
thread they load only if that person enabled shared threads for MCP servers in
App Home (`user_settings.mcp_threads`), and there a server set to ask only
before deleting still asks before writing
(`mcp/user-servers/approval.ts`).

## The Mastra patch

[`patches/@mastra+core@1.69.0.patch`](./patches/@mastra+core@1.69.0.patch)
patches both `dist/agent-*` bundles of `@mastra/core` and is registered under
`patchedDependencies` in `package.json`. `scripts/postbuild.ts` copies it into
`.mastra/output`, so the built server installs the patched core too. It
carries six fixes:

- **In-stream model fallback.** Stock Mastra moves to the next model in the
  fallback list only when the model call throws. An error delivered as an
  in-band stream chunk returns normally, so the remaining models were never
  tried. The patch sets `advanceFallbackModel` in that case.
- **A fresh retry budget per model.** When the patch switches models, it resets
  `processorRetryCount` to 0, so the new model does not inherit the exhausted
  count of the model it replaces.
- **The streamed message survives a retry.** A continued step (a retry or a
  fallback escalation) no longer closes the Slack streaming session early.
- **Only the requester answers an approval.** A tool approval card records who
  triggered it, and clicks from anyone else in the thread are ignored. The
  requester is stored with the pending approval, so after a restart the check
  still holds. Runs with no inbound message (a schedule firing, a `wait` or
  background wake) stash no requester in memory, so the check falls back to the
  stored one, the run's creator. It fails closed: a card with no recorded
  requester is refused.
- **Plan widgets stay under Slack's cap.** A Compact (grouped) turn rolls into a
  new message at a step boundary once it has 40 tasks, and never sends more than
  Slack's 50, so long turns no longer crash the stream.
- **Detailed cards show the tool's summary.** Timeline task output prefers the
  tool's `transform.display` summary over the truncated raw result.

[`patches/@chat-adapter+slack@4.41.0.patch`](./patches/@chat-adapter+slack@4.41.0.patch)
patches the Slack adapter's `dist/index.js`, which native streaming needs:

- **A lost streamed message continues in a new one.** On a long turn Slack can
  drop the streaming message, and the next append or `chat.stopStream` returns
  `message_not_found`. Stock rethrows, and the whole reply vanishes. The patch
  treats it like the expired-stream case it already handles: it starts a new
  segment and resends everything since the lost segment began (for an expired
  segment, everything Slack had not confirmed), at rotation, mid-reply, on a
  plan or task chunk, and at the final stop. Nothing already shown in an earlier
  segment is sent twice.

`scripts/verify-mastra-patch.ts` checks both patches after every build.

The upstream issue for the first two is mastra-ai/mastra#21280. Rollup
content-hashes the bundle file names, so a version bump makes the patch fail to
apply instead of silently dropping it. Rebase it when upgrading `@mastra/core`,
and keep every hunk.

## Project structure

```text
src/
  env.ts                        Zod-validated environment
  mastra/
    index.ts                    Mastra instance: Postgres, Observability, logger, agents, schedules
    config.ts                   Deployment-tunable values
    providers.ts                Model ladders (orchestrator, research, explore, summarizer, images)
    agents/                     orchestrator, plus research, explore and summarizer
    chat/                       Slack side: event handlers, history backfill, thread state, commands,
                                App Home, moderation, usage limits, focus, typing status
    tools/                      Tool registry: Slack, canvas, scheduled tasks, GitHub, web, code mode, images, background jobs
    processors/                 Input and output processors (tool search, tool display, output budget, sandbox, ...)
    prompts/                    System prompt sections (core, personality, Slack, tools, guardrails)
    workspace/                  E2B sandbox workspace (per-thread, isolated) and its template build
    mcp/                        Built-in MCP servers, per-person MCP servers from App Home, their OAuth sign-in and URL checks
    memory/                     Working-memory profile schema
    db/                         Drizzle schema, queries and boot-time migrations
    server/                     Public HTTP routes outside the Slack webhook
    observability/              Langfuse feedback, Slack identity on spans, payload trimming
    lib/                        Shared helpers: logger, ids, crypto, GitHub API, request context
    types/                      Shared and exported types
drizzle/                        gorkie's own SQL migrations
workspace/skills/               Runtime skills the agent loads on demand
```

Constructing the Mastra instance registers the agent and its Slack webhook route
(`/api/agents/orchestrator/channels/slack/webhook`).

## Development

```bash
bun run dev             # Mastra Studio and the Slack bot
bun run build           # Production build
bun run start           # Run the production build
bun run build:template  # Build the configured E2B image
bun run typecheck
bun run check           # Biome/ultracite
bun run check:spelling
```

## License

[AGPL-3.0](./LICENSE)

[mastra]: https://mastra.ai
[channels]: https://mastra.ai/docs/channels/overview
[chat-sdk]: https://github.com/vercel/chat-sdk
[e2b]: https://e2b.dev
[exa]: https://exa.ai
[hackclub]: https://ai.hackclub.com
[opencode]: https://opencode.ai/docs/zen
[postgres]: https://www.postgresql.org
[duckdb]: https://duckdb.org
[langfuse]: https://langfuse.com
[bun]: https://bun.sh
[om]: https://mastra.ai/docs/memory/observational-memory
