---
title: Task cards show/hide toggle
type: grilling
status: open
claimed: false
blocked_by: [settings-store, app-home-shell, settings-runtime-read]
---

## Question

Add a per-user "show task cards" toggle in App Home. When hidden, suppress the
verbose tool-activity cards gorkie streams (what-it's-doing widgets) and show
only a compact status block instead.

Build:
- Home preferences control bound to `showTaskCards` in settings-store; flips +
  republishes on action.
- In the tool-display path (`src/mastra/chat/tool-display.ts`, a `ToolDisplayFn`):
  when the acting user's `showTaskCards` is false, emit only a minimal status
  indicator rather than the full per-tool `task_update` cards. Define exactly
  what "compact status block" is (e.g. a single "working..." status line that
  updates, no per-tool details/output).

Open sub-questions to resolve here:
- Can a `ToolDisplayFn` even return a compact/minimal form, and does it have the
  acting-user context? (Depends on settings-runtime-read's findings.) If per-user
  branching is impossible inside `toolDisplay`, find the alternative (channels
  `toolDisplay` mode config, or gating card posts downstream).
- What the status-only experience should look and feel like (this is the
  grilling part — get the UX right with the user).

### Context

- Tool display: `src/mastra/chat/tool-display.ts` (returns `task_update` stream
  chunks per tool). Channels `toolDisplay` is wired in
  `src/mastra/agents/gorkie.ts`. Load the `mastra` skill; read the channels
  source for how tool cards are rendered and whether they can be suppressed
  per-user.
- Acting-user settings access from settings-runtime-read; toggle rendering from
  app-home-shell; value store from settings-store.

Produce: a working toggle that collapses a user's tool cards to a compact status
block when off.
