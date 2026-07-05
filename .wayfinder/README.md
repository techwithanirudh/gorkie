# Wayfinder tracker (local markdown)

This repo has no `docs/agents/issue-tracker.md`, so wayfinder maps live here as
local markdown (the skill's default tracker).

## Layout

```
.wayfinder/
  <map-slug>/
    map.md              # the map itself (label: wayfinder:map)
    tickets/
      <ticket-slug>.md  # one child ticket per file
```

## Ticket frontmatter

```yaml
---
title: <human name — always refer to a ticket by this, never the slug>
type: research | prototype | grilling | task
status: open | closed
claimed: false            # a session sets true before working, to avoid collisions
blocked_by: [<slug>, ...] # ticket is unblocked when every listed ticket is closed
---
```

A ticket's body is `## Question` plus any context pointers. On resolution: append a
`## Resolution` section, set `status: closed`, and add a one-line pointer to the map's
"Decisions so far".

## Frontier

Open tickets whose `blocked_by` are all `closed` and whose `claimed` is `false`.
