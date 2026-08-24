<div align="center">
  <img alt="gorkie banner" src="./.github/banner.png" />
  <h1>gorkie</h1>
  <p>An AI assistant for Slack, built on Mastra.</p>
</div>

## Introduction

gorkie is an AI assistant for Slack. It replies to mentions, DMs, and
subscribed threads with answers backed by sandboxed code execution and a
broad tool set, and can also run recurring scheduled tasks on its own.

The bot runs as a long-lived Bun process. Slack events are handled through
[Mastra][mastra]'s built-in [channels][channels] feature, which wires the
[Vercel Chat SDK][chat-sdk] Slack adapter in **Socket Mode**, while the agent
runs through Mastra's native runtime. Each Slack thread gets its own isolated
[E2B][e2b] sandbox so gorkie can run commands and inspect files without ever
touching the host machine.

## Features

- Slack-native replies for mentions, DMs, and subscribed thread follow-ups,
  with real-time streaming and a typing indicator.
- Optional opt-in allowlist (`OPT_IN_CHANNEL`): gate access to members of one
  channel, with an in-Slack opt-in card for everyone else.
- Postgres-backed moderation bans. Admins configured through `ADMIN_USER_IDS`
  can use `/gorkie ban @user [reason]` and `/gorkie unban @user`. Banned users
  are ignored before allowlist checks, commands, or agent runs.
- Per-thread [E2B][e2b] sandbox sessions: isolated cloud VMs, never the host.
  Full filesystem access (`read_file`/`write_file`/`edit_file`/`list_files`/
  `delete_file`/`file_stat`) plus shell command execution
  (`execute_command`) with background process support (`get_process_output`,
  `kill_process`).
- Delegated helper agents for research (Slack/web lookups) and codebase
  exploration (read-only workspace inspection), so heavy multi-step digging
  doesn't clutter the main conversation.
- Web search and page fetching via [Exa][exa], plus a Slack "code mode" tool
  for query-driven or exhaustive conversation analysis.
- Slack-native tools: read/summarize conversation history, list threads and
  channels, inspect channels and users, post to another thread/channel/DM,
  upload and download files, react, leave a thread. Reading is restricted to
  the current conversation and public channels; posting elsewhere is
  restricted to the channel already in this conversation, or a DM back to the
  requester.
- Slack Canvas tools: create, list, read, edit, and look up sections.
- Recurring scheduled tasks (cron-based, create/list/pause/resume/delete),
  delivered back into the Slack conversation where they were scheduled.
- AI image generation, deliverable back to Slack via file upload.
- Most tools are loaded on demand via tool search, keeping the base tool list
  small and the context window lean.
- [Observational Memory][om]: long conversations are compressed into a dense
  observation log instead of carrying full raw history.
- Mastra Observability tracing, stored locally via DuckDB.

See [TODO.md](./TODO.md) for the current roadmap and known open issues.

## Tech Stack

- [Bun][bun] and TypeScript
- [Mastra][mastra], agent runtime + [channels][channels]
- [Vercel Chat SDK][chat-sdk] with `@chat-adapter/slack` (via Mastra channels)
- Model routing across the [Hack Club][hackclub] proxy and opencode.ai, with
  automatic per-gateway fallback
- [E2B][e2b] sandbox sessions
- [Exa][exa] for web search and page fetching
- [PostgreSQL][postgres] via `@mastra/pg`
- Mastra Observability, exported to local [DuckDB][duckdb]

## Getting Started

Create a new [Slack app](https://api.slack.com/apps) **from a manifest** using
[`slack-manifest.json`](./slack-manifest.json) (enables Socket Mode, the
App Home, scopes, and event subscriptions). You will also need
[Bun][bun], a [PostgreSQL][postgres] database, an [E2B][e2b] API key, an
[Exa][exa] API key, and a model key ([Hack Club][hackclub] and/or
[OpenCode][opencode]).

```bash
# Clone this repository
git clone https://github.com/techwithanirudh/gorkie.git

# Install dependencies
bun install

# Copy and fill in the environment
cp .env.example .env

# Build the configured E2B sandbox image
bun run build:template

# Run the bot locally (also serves Mastra Studio at http://localhost:4111)
bun run dev
```

Local development uses Slack Socket Mode, so the bot does not need a public
HTTP tunnel to receive Slack events. You should see `[gorkie] online` once
connected.

Do not run multiple local instances against the same Slack app token; Slack
Socket Mode connections will race and produce confusing behavior.

For a production-style run: `bun run build` then `bun run start`.

### Local Postgres

The default `DATABASE_URL` in [`.env.example`](./.env.example) targets a
local database named `gorkie`. Mastra auto-creates its tables on first run.

## Environment

| Variable | Required | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | yes | Bot User OAuth token (`xoxb-…`) |
| `SLACK_APP_TOKEN` | yes | App-level token with `connections:write` (`xapp-…`) |
| `OPT_IN_CHANNEL` | no | Slack channel id gating access to members only (opt-in allowlist); unset means everyone is allowed |
| `ADMIN_USER_IDS` | no | Comma-separated Slack user IDs allowed to run `/gorkie ban` and `/gorkie unban` |
| `HACKCLUB_API_KEY` | yes | Hack Club AI proxy key, a gateway rung for every model |
| `OPENCODE_API_KEY` | yes | opencode.ai/zen gateway key, tried alongside Hack Club |
| `DATABASE_URL` | yes | Postgres connection string |
| `E2B_API_KEY` | yes | E2B sandbox key (`e2b_…`) |
| `EXA_API_KEY` | yes | Exa key, powers `search_web`/`fetch_url` |
| `AGENTMAIL_API_KEY` | no | Broker AgentMail API access into sandbox egress for `gorkie@agentmail.to` |
| `GITHUB_TOKEN` | no | Broker GitHub API access into sandbox egress for the `gorkie-agent` account |

See [`.env.example`](./.env.example) for the full annotated list.

## Project Structure

```text
src/
  env.ts                        Zod-validated environment
  mastra/
    index.ts                    Mastra instance: Postgres, Observability, logger, agents
    config.ts                   Sandbox and agent config
    providers.ts                Model gateway definitions (orchestrator, summarizer, scout, explorer, images)
    agents/orchestrator.ts       The agent: model, instructions, memory, tools, channels
    agents/research.ts          Delegated Slack/web research helper agent
    agents/explore.ts           Delegated read-only codebase exploration helper agent
    chat/                       Chat SDK client, handlers, typing status
    workspace/                  E2B sandbox workspace (per-thread, isolated)
    tools/                      Tool registry: Slack, canvas, scheduled tasks, sandbox, web, code mode
    processors/                 Input/output processors (delegated tools, sandbox, tool media)
    prompts/                    System prompt sections (core, personality, Slack, tools)
    mcp/                        MCPClient scaffold for connecting external MCP servers
```

Constructing the Mastra instance registers the agent, which starts the Slack
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
