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
SDK][chat-sdk] Slack adapter in Socket Mode while the agent runs on Mastra's
native runtime. Each Slack thread gets its own [E2B][e2b] sandbox, so gorkie
runs commands and inspects files without touching the host machine.

## Features

- Slack-native replies for mentions, DMs, and subscribed thread follow-ups,
  streamed as they generate, with a typing indicator.
- Optional opt-in allowlist (`OPT_IN_CHANNEL`): gate access to members of one
  channel, with an in-Slack opt-in card for everyone else.
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
- Slack-native tools: read/summarize conversation history, list threads and
  channels, inspect channels and users, post to another thread/channel/DM,
  upload and download files, react, join or leave a thread. It reads only the current
  conversation and public channels, and DMs only the person who asked.
- Slack Canvas tools: create, list, read, edit, and look up sections.
- Turn control: `skip` ends a turn without replying (acknowledgements, noise,
  messages meant for someone else), and `wait` resumes the thread later.
- Recurring scheduled tasks (cron-based, create/list/pause/resume/delete).
  Each run posts back into the conversation where it was scheduled.
- AI image generation, uploaded back into the Slack thread as a file.
- Most tools load on demand through tool search, so the base tool list and the
  prompt stay small.
- [Observational Memory][om] compresses a long conversation into an
  observation log instead of carrying the full raw history, and working memory
  keeps each person's stated reply preferences. See [Memory](#memory).
- Runtime skills in [`workspace/skills/`](./workspace/skills/): `67ify`,
  `agent-browser`, `agentmail`, `artifacts` (a single HTML page on a temporary
  Cloudflare Worker), `github`, `mermaid-diagrams`, `taste-skill`, `unslop`,
  `voice` and `wrangler`.
- Mastra Observability tracing, stored locally in DuckDB.

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
- Mastra Observability, exported to local [DuckDB][duckdb]

## Getting started

Create a new [Slack app](https://api.slack.com/apps) from a manifest using
[`slack-manifest.json`](./slack-manifest.json), which turns on Socket Mode,
the App Home, scopes, and event subscriptions. You also need [Bun][bun], a
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

Local development uses Slack Socket Mode, so the bot needs no public HTTP
tunnel to receive Slack events. It logs `[gorkie] online` once connected.

Do not run two local instances against the same Slack app token. Their Socket
Mode connections race, and the resulting behavior is hard to diagnose.

For local development, create a second Slack app from
[`slack-manifest.dev.json`](./slack-manifest.dev.json) (`gorkie (dev)`) and put
its tokens, including its own `SLACK_APP_TOKEN`, in your local `.env`. Dev then
holds its own Socket Mode connection and never races production for events.

For a production-style run: `bun run build` then `bun run start`.

### Local Postgres database

The default `DATABASE_URL` in [`.env.example`](./.env.example) points at a
local database named `gorkie`. Mastra creates its tables on first run.

## Environment

| Variable | Required | Description |
|---|---|---|
| `PROJECT_ROOT` | yes | Absolute path to this repo. `mastra dev`/`start` run from `.mastra/output`, so migrations, skills, and the DuckDB file resolve against this instead of cwd |
| `SLACK_BOT_TOKEN` | yes | Bot User OAuth token (`xoxb-…`) |
| `SLACK_APP_TOKEN` | yes | App-level token with `connections:write` (`xapp-…`) |
| `SLACK_USER_TOKEN` | yes | Slack user token, not the bot token, used for public-channel search. Mint it with `search:read.public` only; gorkie verifies the granted scopes on first use and refuses the token if it also carries `search:read.im`, `search:read.mpim`, or `search:read.private`. See [docs/slack-search.md](docs/slack-search.md) |
| `OPT_IN_CHANNEL` | no | Slack channel id gating access to members only (opt-in allowlist); unset means everyone is allowed |
| `HACKCLUB_API_KEY` | yes | Hack Club AI proxy key, tried for every model |
| `OPENCODE_API_KEY` | yes | opencode.ai/zen gateway key, tried alongside Hack Club |
| `DATABASE_URL` | yes | Postgres connection string |
| `LANGFUSE_PUBLIC_KEY` | yes | Langfuse public key. Tracing is the only production exporter, so the agent refuses to start without it |
| `LANGFUSE_SECRET_KEY` | yes | Langfuse secret key |
| `LANGFUSE_BASE_URL` | no | Self-hosted Langfuse only; defaults to `https://cloud.langfuse.com` |
| `E2B_API_KEY` | yes | E2B sandbox key (`e2b_…`) |
| `CREDENTIALS_KEY` | yes | Encrypts connected GitHub and MCP tokens at rest (`openssl rand -base64 32`) |
| `GITHUB_APP_SLUG` | yes | The app's URL slug, used to link people to the install page |
| `GITHUB_APP_CLIENT_ID` | yes | GitHub App client id, for the App Home sign-in (see [docs/github-app.md](./docs/github-app.md)) |
| `GITHUB_APP_CLIENT_SECRET` | yes | GitHub App client secret, used to refresh expiring user tokens |
| `EXA_API_KEY` | yes | Exa key, powers `search_web`/`fetch_url` |
| `AGENTMAIL_API_KEY` | no | Lets the sandbox reach the AgentMail API as `gorkie@agentmail.to`, without the key entering the sandbox |

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

## The Mastra patch

[`patches/@mastra+core@1.69.0.patch`](./patches/@mastra+core@1.69.0.patch)
patches both `dist/agent-*` bundles of `@mastra/core` and is registered under
`patchedDependencies` in `package.json`. `scripts/postbuild.ts` copies it into
`.mastra/output`, so the built server installs the patched core too. It
carries four fixes:

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
  triggered it, and clicks from anyone else in the thread are ignored.

The upstream issue for the first two is mastra-ai/mastra#21280. Rollup
content-hashes the bundle file names, so a version bump makes the patch fail to
apply instead of silently dropping it. Rebase it when upgrading `@mastra/core`,
and keep every hunk.

## Project structure

```text
src/
  env.ts                        Zod-validated environment
  mastra/
    index.ts                    Mastra instance: Postgres, Observability, logger, agents
    config.ts                   Sandbox and agent config
    providers.ts                Model gateway definitions (orchestrator, summarizer, scout, explorer, images)
    agents/orchestrator.ts      The agent: model, instructions, memory, tools, channels
    agents/research.ts          Delegated Slack/web research helper agent
    agents/explore.ts           Delegated read-only codebase exploration helper agent
    chat/                       Chat SDK client, handlers, typing status
    workspace/                  E2B sandbox workspace (per-thread, isolated)
    tools/                      Tool registry: Slack, canvas, scheduled tasks, sandbox, web, code mode
    processors/                 Input/output processors (delegated tools, sandbox, tool media)
    prompts/                    System prompt sections (core, personality, Slack, tools, guardrails)
    mcp/                        MCPClient scaffold for connecting external MCP servers
```

Constructing the Mastra instance registers the agent, which opens the Slack
Socket Mode connection.

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
[bun]: https://bun.sh
[om]: https://mastra.ai/docs/memory/observational-memory
