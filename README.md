<div align="center">
  <img alt="gorkie banner" src="./.github/banner.png" />
  <h1>gorkie</h1>
  <p>An AI coding assistant for Slack, built on Mastra.</p>
</div>

## Table of Contents

1. [Introduction](#introduction)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Getting Started](#getting-started)
5. [Environment](#environment)
6. [Project Structure](#project-structure)
7. [Development](#development)
8. [License](#license)

## Introduction

gorkie is an AI assistant for Slack. It replies to mentions, DMs, and subscribed
threads with answers backed by sandboxed code execution and tools.

The bot runs as a long-lived Bun process. Slack events are handled through
[Mastra][mastra]'s built-in [channels][channels] feature, which wires the
[Vercel Chat SDK][chat-sdk] Slack adapter in **Socket Mode**: while the agent
runs through Mastra's native runtime. Each Slack thread gets its own isolated
[E2B][e2b] sandbox so gorkie can run commands and inspect files without ever
touching the host machine.

## Features

- Slack-native replies for mentions, DMs, and subscribed thread follow-ups.
- Real-time streaming responses with live tool-activity widgets.
- Per-thread [E2B][e2b] sandbox sessions: isolated cloud VMs, never the host.
- [Observational Memory][om]: long conversations are compressed into a dense
  observation log instead of carrying full raw history.
- A `get_weather` tool (Open-Meteo, no key required).
- `##` ignore: messages with a line starting with `##` are skipped.
- [Langfuse][langfuse] tracing with sensitive-data redaction.

## Tech Stack

- [Bun][bun] and TypeScript
- [Mastra][mastra], agent runtime + [channels][channels]
- [Vercel Chat SDK][chat-sdk] with `@chat-adapter/slack` (via Mastra channels)
- [OpenRouter][openrouter] model routing (defaults to the [Hack Club][hackclub] proxy)
- [E2B][e2b] sandbox sessions
- [PostgreSQL][postgres] via `@mastra/pg`
- [Langfuse][langfuse] + Mastra Observability
- [Pino][pino] logging

## Getting Started

Create a new [Slack app](https://api.slack.com/apps) **from a manifest** using
[`slack-manifest.yaml`](./slack-manifest.yaml) (enables Socket Mode, the Assistant
view, scopes, and event subscriptions). You will also need [Bun][bun], a
[PostgreSQL][postgres] database, an [E2B][e2b] API key, and a model key
([Hack Club][hackclub] or [OpenRouter][openrouter]).

```bash
# Clone this repository
git clone https://github.com/techwithanirudh/gorkie.git

# Install dependencies
bun install

# Copy and fill in the environment
cp .env.example .env

# Start the Slack bot
bun run bot
```

Local development uses Slack Socket Mode, so the bot does not need a public HTTP
tunnel to receive Slack events. You should see `[gorkie] online` once connected.

### Local Postgres

The default `DATABASE_URL` targets a local cluster on port `5434` (database
`gorkie`, role `coder`, trust auth). Mastra auto-creates its tables on first run.

```bash
PGBIN=/usr/lib/postgresql/15/bin
PGDATA="$HOME/.local/pgdata"
$PGBIN/initdb -D "$PGDATA" -U coder --auth=trust          # first time only
$PGBIN/pg_ctl -D "$PGDATA" -o "-p 5434 -k /tmp" -l "$PGDATA/server.log" start
$PGBIN/createdb -h 127.0.0.1 -p 5434 -U coder gorkie      # first time only
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | yes | Bot User OAuth token (`xoxb-…`) |
| `SLACK_APP_TOKEN` | yes | App-level token with `connections:write` (`xapp-…`) |
| `OPENROUTER_API_KEY` | yes | Model key, a Hack Club `sk-hc-v1-…` key with the default base URL |
| `OPENROUTER_BASE_URL` | no | Defaults to the Hack Club proxy; drop it to use real OpenRouter |
| `DATABASE_URL` | yes | Postgres connection string |
| `E2B_API_KEY` | yes | E2B sandbox key (`e2b_…`) |
| `AGENTMAIL_API_KEY` | no | Broker AgentMail API access into sandbox egress for `gorkie@agentmail.to` |
| `GITHUB_TOKEN` | no | Broker GitHub API access into sandbox egress for the `gorkie-agent` account |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | no | Enable Langfuse tracing when both are set |
| `LANGFUSE_BASE_URL` | no | Defaults to `https://cloud.langfuse.com` |

## Project Structure

```text
index.ts                       Entry point: brings channels online, graceful shutdown
src/
  env.ts                       Zod-validated environment
  mastra/
    index.ts                   Mastra instance: Postgres, Observability, logger, agent
    agents/gorkie.ts           The agent: model, instructions, memory, tools, channels
    workspace/index.ts         E2B sandbox workspace (per-thread, isolated)
    tools/weather.ts           get_weather tool
    channels/handlers.ts       Slack handler helpers (## ignore)
```

Constructing the Mastra instance registers the agent, which starts the Slack
Socket Mode connection. See [DESIGN.md](./DESIGN.md) for the full architecture
and the reasoning behind using Mastra channels.

## Development

```bash
bun run bot          # run the bot (Socket Mode)
bun run dev          # Mastra Studio at http://localhost:4111 (don't run alongside the bot)
bunx tsc --noEmit    # typecheck
```

## License

MIT.

[bun]: https://bun.sh/
[mastra]: https://mastra.ai/
[channels]: https://mastra.ai/docs/agents/channels
[chat-sdk]: https://chat-sdk.dev/
[openrouter]: https://openrouter.ai/
[hackclub]: https://ai.hackclub.com/
[e2b]: https://e2b.dev/
[postgres]: https://www.postgresql.org/
[om]: https://mastra.ai/docs/memory/observational-memory
[langfuse]: https://langfuse.com/
[pino]: https://getpino.io/
