---
title: Custom Instructions section + edit modal
type: prototype
status: open
claimed: false
blocked_by: [settings-store, app-home-shell]
---

## Question

Build the Custom Instructions section: display current instructions, an Edit/Add
button opening a simple Chat SDK modal to edit them, a Clear action, and persist
+ republish on submit.

Scope (per user decision): a plain instructions textarea. NO preset library, NO
preset picker — the reference had those; drop them.

Build:
- Home section: shows current instructions (truncated) or an empty state, with an
  Edit/Add button and a Clear button (with confirm).
- Edit modal as **Chat SDK JSX** (`Modal` + `Input` multiline) — see
  `node_modules/chat/docs/modals.mdx`. Opened via the action handler from
  app-home-shell.
- `onModalSubmit` persists via settings-store (`instructions`), then republishes
  the home view.
- Clear action wipes `instructions` and republishes.

### Context

- Reference section (Bolt + slack-block-builder), mirror the layout not the deps:
  `../worktrees/gorkie-slack/reference/apps/bot/src/slack/features/customizations/view/_components/custom-instructions.ts`
  and its modal actions under `.../customizations/prompts/`.
- Rendering + handler registration pattern comes from app-home-shell.
- Persistence from settings-store.
- Making the saved instructions actually AFFECT the agent is a separate ticket
  (instruction-injection) — this ticket only sets/clears/displays them.

Produce: a working Custom Instructions section a user can edit and clear end to
end (persisted + reflected on republish).
