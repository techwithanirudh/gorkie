---
name: code-channels
description: Open a dedicated Slack code channel when asked, publish or update preview tabs, maintain session context, or archive completed work.
---

# Code channels

Find the deferred code-channel tools with `search_tools`.

If the current conversation is already a Slack code channel, treat “this code channel”, “the current code channel”, and “the existing code channel” as the current channel. Do not search Slack to rediscover it. Load the specific deferred tool and let its current-channel ownership check target the channel. Search Slack only when the user names a different channel or asks you to find an unknown code channel.

When the user asks for a dedicated code channel, call `create_code_channel` with a short task name. It uses the current message as its origin, preserves Slack's privacy rules, and returns the same channel on a retry. Reply with the returned channel link and ask the user to continue there. The current turn and sandbox stay in the origin conversation. Do not create channels automatically.

Inside a code channel, publish artifacts with `set_code_channel_view`:

- HTML: write a self-contained document in the sandbox, then pass its path, a stable `viewKey` and a display name. Declare HTTPS asset origins through `resourceDomains` if needed. Slack does not allow network fetches from the preview. Inline scripts and rendering are subject to Slack's sandbox policy.
- Diff: save standard unified diff text in the sandbox and pass its path. There is one diff tab per channel; subsequent calls replace it.
- Canvas: pass an existing canvas ID and stable `viewKey`. Default comment access lets people comment while the agent authors the document.
- Pull request: pass its HTTPS URL.
- Block Kit: use `block_kit` with raw `blocks` for custom layouts and interactive elements, or use `title` and `text` for a simple card. Action ids still need a registered `onAction` handler in the app.

Reuse each `viewKey` when updating an artifact. Slack allows five views per channel and caps HTML and diff content at 1,000,000 bytes. A returned `viewId` identifies the tab, not the backing file or canvas. Do not claim publication succeeded unless the tool returned successfully.

Call `update_code_channel` to replace context bar items, identify an existing summary message, or associate an external resource. Send every context item you want to retain, up to five. Use informational items.

Call `set_code_channel_commands` with the complete command set to populate the code channel's slash-command typeahead. Registration replaces this agent's previous commands; pass an empty array to clear them. Commands require `features.code_channels.slash_command_url` in the Slack manifest and are delivered to that endpoint.
Gorkie forwards registered commands in an assigned code channel into the current agent session; moderation commands keep their existing private responses.

Archive with `archive_code_channel` only when the user asks to close or archive the channel. An answer does not end the session. Archive retains history and views for later reading. Pass the timestamp of an existing final summary if available.

Code-channel tools act only on the current channel and require Gorkie to be an assigned agent. If Slack reports missing permissions or a disabled feature, report the setup issue. The app manifest needs `features.code_channels.enabled` and the bot scope `code_channels:manage`, followed by app reinstallation.

Reference: https://docs.slack.dev/ai/slack-code/
