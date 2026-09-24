---
name: topic-summaries
description: Summarize what a Slack channel or thread is about, or what changed in it over a period. Use when someone asks for a topic summary, a recap, a catch-up, "what's this channel about", "what did I miss", a digest of recent threads, or wants the channel topic or a DM thread title updated to match. Also use when asked to post such a summary on a schedule. Covers what gorkie can and cannot change in Slack itself.
---

# Topic summaries

A topic summary answers "what is this place about right now". It is shorter than
a recap and more current than the channel description. Two or three lines for a
thread, a short list of live topics for a channel.

## Gather

- **One thread:** call `summarize_thread`, defaulting to the current thread. It
  reads up to 100 messages. For a longer thread, or when exact wording matters,
  page through `read_conversation_history` with the thread id.
<!-- TODO(slopradar): accuracy | list_threads (and get_channel_info) sit behind tool search too (tools/toolsets.ts:44-45), but line 50 names only canvas and scheduled-task tools | move the search note up and include them -->
- **A channel:** call `list_threads` for recent threads (it returns each root
  message, reply count and last reply time), then `summarize_thread` on the few
  that carry the discussion. For "since Monday" or "this week", filter by
  `lastReplyAt` and say what window you used.
- **Many threads or a whole channel's history:** use Slack code mode rather than
  dozens of separate calls.
- Other channels must be public. You cannot read a private channel or a DM you
  are not in, so say so instead of summarizing around the gap.

## Write it

- Lead with the topics, not the process. One line each: what it is, where it
  stands (decided, open, blocked), and who owns it when that is clear.
- Link the thread for each topic with `get_permalink` so people can jump in.
- Count and rank only from what the tools returned. "Five threads this week" has
  to be five threads you saw. If you only read the most recent page, say "in the
  last N threads" instead of implying the whole channel.
- Leave out `##` side comments unless someone asks; people post those to talk
  without pulling you in.

## Deliver it

- **In the thread:** the normal reply. This is the default.
<!-- TODO(slopradar): accuracy | post_message cannot reach another channel: channel and thread targets must be in the current channel, user targets only the requester (tools/slack/post-message.ts:18) | "another thread in this channel, or a DM to the requester" -->
- **Somewhere else:** `post_message` to another channel or thread, only when
  asked.
- **Something that should stay put:** a canvas. `create_canvas` with
  `mode: channel` makes the channel's Canvas tab (fails if one exists; then use
  `edit_canvas` on it). Canvas mentions use `![](@U...)` and `![](#C...)`, not
  `<@U...>`.
- **On a schedule:** `create_scheduled_task` in the thread where the digest
  should land, with a task like "Summarize the threads in this channel active
  since the last run and post the live topics". Cron cadence has a minimum
  interval (30 minutes in production); daily or weekly is the usual fit.
  Canvas and scheduled-task tools sit behind tool search, so search for them
  before saying they are unavailable.

## What you cannot change

Say this plainly when someone asks. Do not pretend to have done it.

- **Channel topic or purpose:** you have no tool for `conversations.setTopic` or
  `conversations.setPurpose`, and the app lacks the scope. Write the topic line
  (Slack caps it at 250 characters) and tell them to set it with `/topic` or
  the channel's details panel.
- **DM or assistant thread title:** there is no title tool you can call. Offer
  the title text instead.
- **Pins and bookmarks:** read-only for you. You cannot pin the summary or add
  it as a bookmark; a channel canvas is the durable alternative.
