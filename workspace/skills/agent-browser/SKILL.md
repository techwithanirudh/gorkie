---
name: agent-browser
description: Browser automation CLI for AI agents. Use to drive a web page (navigate, fill forms, click, screenshot, extract data), or to QA, dogfood or bug-hunt a web app.
---

# agent-browser

Fast browser automation CLI for AI agents. Chrome/Chromium via CDP with accessibility-tree snapshots and compact `@eN` element refs.

agent-browser is preinstalled. Never reinstall or update it with npm: `/usr/local/bin/agent-browser` is a wrapper that launches the stealth browser, and a reinstall overwrites it.

Screenshots saved to the sandbox (for example with `agent-browser screenshot page.png`) can be viewed directly with the `view_image` tool. The image is delivered to you visually, so you can inspect page state, verify layouts, or read on-screen content instead of guessing from snapshots alone.

Every browser session starts logged out, with no pre-existing account state. You do NOT have a signed-in Slack (or any other site) session, including the requester's own. Never claim you're "using the existing Slack session" or act as if you're already authenticated somewhere. You aren't, and there is no way for you to act as a specific person's personal account. Never use the browser to read or post in Slack; use gorkie's Slack tools for that. Never ask for or accept a password, one-time code or other credential in Slack: anything posted there lands in memory and traces. If a task needs a login, stop at the login page and tell the user what you can't do and why instead of implying access you don't have.

## Working in the thread

- Progress goes in `status_update` ("filling the signup form"), never in text. Text is for the answer, or for a decision or blocker the person needs before you finish.
- Before any payment, purchase, deletion or other irreversible submit, stop, screenshot the page, and get the requester's explicit confirmation in the thread.
- For a multi-step flow the user will want to trust or replay, record the session (agent-browser supports video recording) and upload the recording.

## Start here

This file is a discovery stub, not the usage guide. Before running any `agent-browser` command, load the actual workflow content from the CLI:

```bash
agent-browser skills get core             # start here: workflows, common patterns, troubleshooting
agent-browser skills get core --full      # include full command reference and templates
```

The CLI serves skill content that always matches the installed version, so instructions never go stale. The content in this stub cannot change between releases, which is why it just points at `skills get core`.

## Specialized skills

Load a specialized skill when the task calls for it:

```bash
agent-browser skills get dogfood           # Exploratory testing / QA / bug hunts
```

Run `agent-browser skills list` to see everything available on the installed version.

## Troubleshooting

### Known bug: hung sessions

**Symptom**: `agent-browser open` or `agent-browser close` hangs and times out with no output at all, and every later agent-browser call hangs too.

**Cause**: the agent-browser daemon can get wedged, either by a crashed/frozen Chrome child that never gets reaped, or by a command that got killed mid-flight (e.g. by this sandbox's own `execute_command` timeout) without the daemon handling the cancellation cleanly. Once wedged, the daemon hangs on *every* call.

**Do not** keep retrying the same command; that never fixes a wedged daemon and only burns turns. The moment a second consecutive hang happens on the same task:

```bash
pkill -9 -f 'agent-browser' 2>/dev/null
find ~/.agent-browser -maxdepth 1 \( -name '*.sock' -o -name '*.pid' \) -delete 2>/dev/null
```

Then retry once. If it hangs again, stop and report it instead of looping.

This sandbox also **persists across turns in the thread**, so a browser left open can carry a live Chrome process into the next turn and cause this same hang later. Run `agent-browser close` when you're done, not just when you hit an error.
