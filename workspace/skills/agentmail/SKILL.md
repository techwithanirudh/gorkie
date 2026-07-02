---
name: agentmail
description: Give Gorkie email access through AgentMail. Use when the user asks Gorkie to send email, read email, inspect inboxes, reply to messages, handle attachments, draft mail for approval, or set up email notifications.
---

# AgentMail

Gorkie owns the inbox `gorkie@agentmail.to`. Use AgentMail from Python inside the sandbox when the user asks to send, receive, search, reply to, draft, or inspect email.

## Credentials

Use this placeholder:

```python
from agentmail import AgentMail

client = AgentMail(api_key="brokered-by-gorkie")
```

The placeholder is not a secret. It only makes the SDK construct authenticated requests. Gorkie's host can inject the real `Authorization` header through the sandbox network policy. Never print API keys, bearer headers, or credential-broker internals.

## Ground Rules

- Use `gorkie@agentmail.to` unless the user names another inbox.
- Prefer drafts for sensitive, external, broad, or ambiguous messages.
- Send directly only when the user clearly asked for the exact recipient, subject, and body.
- Before sending attachments, confirm the path exists and check size with `ls -lh`.
- Summarize recipient addresses, subject, body intent, labels, and attachment filenames after any send or draft.
- Do not expose private message bodies unless the user asked to inspect them.
- Do not set up webhook forwarding to third-party URLs without explicit approval.

## Common Workflows

List recent mail:

```python
from agentmail import AgentMail

client = AgentMail(api_key="brokered-by-gorkie")
messages = client.inboxes.messages.list(inbox_id="gorkie@agentmail.to")
for message in messages:
    print(message)
```

Send plain text mail:

```python
client.inboxes.messages.send(
    inbox_id="gorkie@agentmail.to",
    to="recipient@example.com",
    subject="Hello",
    text="Plain text body",
)
```

Create a draft for user approval:

```python
draft = client.inboxes.drafts.create(
    inbox_id="gorkie@agentmail.to",
    to="recipient@example.com",
    subject="Pending approval",
    text="Draft content",
)
print(draft)
```

## References

- Full Python inbox, message, thread, draft, attachment, pod, and label examples: [Core API](references/api.md).
- Webhook creation and signature verification: [Webhooks](references/webhooks.md).
- WebSocket subscriptions for live inbox events: [WebSockets](references/websockets.md).
