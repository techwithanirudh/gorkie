---
title: Stats-for-nerds usage toggle
type: prototype
status: open
claimed: false
blocked_by: [settings-store, app-home-shell, settings-runtime-read]
---

## Question

Add a per-user "stats for nerds" toggle in App Home, and when it is on, append
per-turn token usage to the "gorkie may make mistakes" completion footer.

Build:
- Home preferences control (toggle button or checkbox) bound to
  `statsForNerds` in settings-store; flips + republishes on action.
- In `src/mastra/processors/turns.ts` (footer at line ~67): when the acting
  user's `statsForNerds` is true, append token usage for the turn (e.g. input /
  output / total tokens) to the footer. When false, footer is unchanged.

Open sub-question to resolve here: **where do per-turn token counts come from?**
Check what usage the turn processor already has on its event/object; if absent,
find it (stream usage vs the observability trace / DuckDB). Load the `mastra`
skill and read the processor + channels source.

### Context

- Footer touchpoint: `src/mastra/processors/turns.ts` (the
  "gorkie may make mistakes. double-check important information." block).
- Acting-user settings access during the turn comes from settings-runtime-read.
- Toggle rendering + action registration comes from app-home-shell; value store
  from settings-store.

Produce: a working toggle whose state changes whether the footer shows token
usage for that user's turns.
