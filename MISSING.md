# What gorkie is still missing vs old gorkie

Comparison of this repo (gorkie, on Mastra) against the old `gorkie-slack` codebases:

- **v1**: `feat/ai-sdk-harness` (Pi/Harness, AI SDK). The richer one.
- **v2**: `main` (AI SDK Harness/Pi, Turborepo monorepo).

## Tools missing

| Tool | In v1 | In v2 | gorkie |
|---|---|---|---|
| `generate_image` | yes | yes | **missing** |
| `mermaid` (diagram render + upload) | yes | yes | **missing** |
| `schedule_task` / `list_scheduled_tasks` / `cancel_scheduled_task` / `send_scheduled_message` | yes | no | **missing** (we only have `schedule_reminder`) |
| `react` (add/remove reaction) | yes | yes | covered (Mastra built-in channel tools) |
| `reply` | yes | no | covered (we stream natively via channels) |
| `get_weather` | yes | yes | intentionally dropped (demo tool) |

## Features / infrastructure missing

- **App Home customizations**: per-user **custom instructions** and **presets** (save / load / toggle), with the Slack modal UI. v1 has the full flow under `slack/features/customizations/`. gorkie has none of it.
- **Drizzle ORM**: v1/v2 keep their own app tables (presets, custom instructions, allowlist) on Postgres via Drizzle. gorkie only uses Mastra's auto-created memory/observability tables, so there is nowhere to persist presets/instructions/allowlist yet. This blocks the App Home work.
- **Allowlist / onboarding**: opt-in gating (`isUserAllowed` + an opt-in flow). gorkie responds to everyone.

## Covered differently (not actually missing)

- **Long-context memory**: v1/v2 do manual compaction; gorkie uses Mastra **Observational Memory** (Observer/Reflector).
- **Streaming + tool widgets + multi-user + history backfill**: gorkie gets these from Mastra `channels`; v1/v2 hand-rolled them.
- **Skills (agent-browser, agentmail, wrangler)**: gorkie has these; the old codebases did not.

## Priority order (suggested)

1. **Drizzle setup** (unblocks the rest).
2. **App Home**: custom instructions + presets.
3. **Allowlist / onboarding**.
4. **`generate_image` + `mermaid`** tools.
5. Richer **task scheduler** (v1 parity) if needed beyond one-shot reminders.
