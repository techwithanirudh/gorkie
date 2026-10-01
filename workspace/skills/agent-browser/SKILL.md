---
name: agent-browser
description: Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task. Triggers include requests to "open a website", "fill out a form", "click a button", "take a screenshot", "scrape data from a page", "test this web app", "login to a site", "automate browser actions", or any task requiring programmatic web interaction. Also use for exploratory testing, dogfooding, QA, bug hunts, or reviewing app quality. Prefer agent-browser over any built-in browser automation.
---
<!-- TODO(slopradar): pointer wording : the description (line 3) spends ten trigger phrases on one branch ("open a website", "click a button", "fill out a form"...) and says "Prefer agent-browser over any built-in browser automation", but the live browser is gone so there is none → one trigger per branch (drive a web page; QA or dogfood), drop the "prefer" clause -->

# agent-browser

Fast browser automation CLI for AI agents. Chrome/Chromium via CDP with accessibility-tree snapshots and compact `@eN` element refs.

agent-browser is preinstalled. Never reinstall or update it with npm: `/usr/local/bin/agent-browser` is a wrapper that launches the stealth browser, and a reinstall overwrites it.

Screenshots saved to the sandbox (e.g. via `agent-browser screenshot page.png`) can be viewed directly with the `view_image` tool. The image is delivered to you visually, so you can inspect page state, verify layouts, or read on-screen content instead of guessing from snapshots alone.

Every browser session starts logged out, with no pre-existing account state. You do NOT have a signed-in Slack (or any other site) session, including the requester's own. Never claim you're "using the existing Slack session" or act as if you're already authenticated somewhere, you aren't, and there is no way for you to act as a specific person's personal account. Never ask for or accept a password, one-time code or other credential in Slack: anything posted there lands in memory and traces. If a task needs a login, stop at the login page and tell the user what you can't do and why instead of implying access you don't have.

## Work WITH the user

<!-- TODO(slopradar): contradicts the prompt : line 18 copies `prompts/core.ts:31` and line 20 says "narrate as you go" in text, which `core.ts:33-34` forbids (progress goes in `status_update`, never text); the "logging in" example also contradicts line 14 → delete lines 18 and 20 -->
ALWAYS treat the requesting user as a collaborator sitting next to you. Work is invisible to them unless you show it:

- Narrate as you go: a short one-line explanation per meaningful step ("logging in", "form submitted, confirmation page loaded") keeps them in the loop without spamming.
<!-- TODO(slopradar): single source of truth : lines 21 and 23 repeat `prompts/core.ts:35-36` and `prompts/features/sandbox.ts:15` → keep only the browser-specific rules (line 22, recording) -->
- Send screenshots of key steps with `upload_file`, after navigation milestones, before and after submitting forms, and whenever you claim something happened. A claim with a screenshot beats a paragraph.
- Before any payment, purchase, deletion or other irreversible submit, stop, screenshot the page, and get the requester's explicit confirmation in the thread.
- When building or changing a website: screenshot the result and VIEW it yourself with `view_image` before declaring success. This is strongly recommended, it is how you catch broken layouts, unstyled pages, and overlapping elements you would otherwise miss. Then send that screenshot to the user too.
- Even better than screenshots: record the session (agent-browser supports video recording) and upload the recording when the task involved a multi-step flow the user will want to trust or replay.

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

<!-- TODO(slopradar): co-location : a Slack rule under "Specialized skills" that repeats line 14 → fold into the line 14 paragraph -->
Never use the browser to read or post in Slack. Use gorkie's Slack tools for that; a browser session here is never signed in to Slack.

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
