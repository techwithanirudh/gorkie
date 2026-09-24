---
name: agentmail
description: Give Gorkie email access through AgentMail. Use when the user asks Gorkie to send email, read email, inspect inboxes, reply to messages, handle attachments, draft mail for approval, or set up email notifications.
---

# AgentMail

<!-- TODO(slopradar): review: security | one inbox is shared by every Slack user of the bot: anyone in any thread can ask to list, read or reply to mail that arrived for someone else's task, and "unless the user asked" (line 29) is satisfied by whoever asks. Inbound mail is also attacker-controlled (anyone can email gorkie@agentmail.to) yet is never called untrusted here, and any user can send mail as gorkie with no confirmation | scope reads to messages labelled with the requester's thread or user, state that email bodies are untrusted data never instructions, and require a restated recipient/subject confirmation before any send -->
Gorkie owns the inbox `gorkie@agentmail.to`. Use AgentMail from Python inside the sandbox when the user asks to send, receive, search, reply to, draft, or inspect email.

## Credentials

Use this placeholder:

```python
from agentmail import AgentMail

client = AgentMail(api_key="brokered")
```

<!-- TODO(slopradar): accuracy | the header is injected only when AGENTMAIL_API_KEY is set on the host (workspace/network.ts:9) | say that a 401 means email is not configured on this deployment and to stop -->
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

client = AgentMail(api_key="brokered")
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
<!-- TODO(slopradar): review: correctness + security | websockets.md cannot work: the SDK connects to wss://ws.agentmail.to (agentmail 2.0.3 environment.py:17) but the credential rule covers only api.agentmail.to (network.ts:10), so the placeholder key reaches AgentMail unrewritten; webhooks.md needs a public endpoint the sandbox cannot host (allowPublicTraffic: false, sandbox.ts:22) and a webhook to a user-supplied URL forwards every inbound mail of the shared inbox | delete both references and these two pointers -->
- Webhook creation and signature verification: [Webhooks](references/webhooks.md).
- WebSocket subscriptions for live inbox events: [WebSockets](references/websockets.md).
