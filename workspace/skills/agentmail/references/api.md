# AgentMail Core API

Use Python. The sandbox template preinstalls the `agentmail` Python package for Gorkie AgentMail work.

## Client

```python
from agentmail import AgentMail

client = AgentMail(api_key="brokered-by-gorkie")
inbox = "gorkie@agentmail.to"
```

`brokered-by-gorkie` is a placeholder. It is safe to show in code. The real token stays on the host.

## Inboxes

```python
inbox_obj = client.inboxes.create(
    username="gorkie-test",
    domain="agentmail.to",
    display_name="Gorkie Test",
)

inboxes = client.inboxes.list()
current = client.inboxes.get(inbox_id=inbox)

client.inboxes.update(
    inbox_id=inbox,
    display_name="Gorkie",
)

client.inboxes.delete(inbox_id="old-inbox@agentmail.to")
```

Use deletion only when the user explicitly asks. Prefer reading or updating existing inboxes.

## Messages

Send a message:

```python
sent = client.inboxes.messages.send(
    inbox_id=inbox,
    to="recipient@example.com",
    subject="Hello from Gorkie",
    text="Plain text body",
    html="<p>Plain text body</p>",
    labels=["sent-by-gorkie"],
)
print(sent)
```

List and fetch messages:

```python
messages = client.inboxes.messages.list(
    inbox_id=inbox,
    limit=20,
)

message = client.inboxes.messages.get(
    inbox_id=inbox,
    message_id="msg_123",
)
```

Reply to a message:

```python
reply = client.inboxes.messages.reply(
    inbox_id=inbox,
    message_id="msg_123",
    text="Thanks for the note.",
)
```

Update labels:

```python
client.inboxes.messages.update(
    inbox_id=inbox,
    message_id="msg_123",
    add_labels=["replied"],
    remove_labels=["unreplied"],
)
```

Delete a message only after explicit user approval:

```python
client.inboxes.messages.delete(
    inbox_id=inbox,
    message_id="msg_123",
)
```

## Attachments

Read files from the sandbox, base64 encode them, and include content type.

```python
import base64
from pathlib import Path

path = Path("/home/user/report.pdf")
content = base64.b64encode(path.read_bytes()).decode("utf-8")

sent = client.inboxes.messages.send(
    inbox_id=inbox,
    to="recipient@example.com",
    subject="Report",
    text="See attached.",
    attachments=[
        {
            "content": content,
            "filename": path.name,
            "content_type": "application/pdf",
        }
    ],
)
```

If an attachment has an unknown MIME type, inspect it with `file --mime-type` before sending.

## Threads

Threads are useful for understanding context before replying.

```python
threads = client.inboxes.threads.list(
    inbox_id=inbox,
    labels=["unreplied"],
    limit=20,
)

thread = client.inboxes.threads.get(
    inbox_id=inbox,
    thread_id="thd_123",
)
```

Org-wide threads are useful when the inbox is not known:

```python
threads = client.threads.list(limit=20)
thread = client.threads.get(thread_id="thd_123")
```

## Drafts

Use drafts whenever the send is sensitive or the user asked to review.

```python
draft = client.inboxes.drafts.create(
    inbox_id=inbox,
    to="recipient@example.com",
    subject="Pending approval",
    text="Draft content",
)

draft = client.inboxes.drafts.get(
    inbox_id=inbox,
    draft_id=draft.draft_id,
)

client.inboxes.drafts.update(
    inbox_id=inbox,
    draft_id=draft.draft_id,
    text="Updated draft content",
)

client.inboxes.drafts.send(
    inbox_id=inbox,
    draft_id=draft.draft_id,
)
```

Do not send a draft unless the user approves the final recipient, subject, and body.

## Labels

Use labels to keep inbox state understandable.

```python
client.inboxes.messages.update(
    inbox_id=inbox,
    message_id="msg_123",
    add_labels=["needs-user-review"],
)

messages = client.inboxes.messages.list(
    inbox_id=inbox,
    labels=["needs-user-review"],
)
```

Useful labels:

- `sent-by-gorkie`
- `drafted-by-gorkie`
- `needs-user-review`
- `replied`
- `unreplied`

## Pods

Pods group inboxes, domains, API keys, and webhooks. Most user tasks do not need pod administration.

```python
pods = client.pods.list()
pod = client.pods.get(pod_id="pod_123")

inboxes = client.pods.inboxes.list(pod_id="pod_123")
domains = client.pods.domains.list(pod_id="pod_123")
webhooks = client.pods.webhooks.list(pod_id="pod_123")
```

Create or delete pods, domains, API keys, or webhooks only with explicit user approval.

## Idempotency

For retry-prone sends, include a stable idempotency key when the SDK method supports request options. If the SDK version does not expose request options for that call, create a draft first and send once after approval.

## Output Discipline

- Print compact objects or selected fields, not full raw payloads.
- Save large message exports to files in `/home/user`.
- Never print `Authorization`, `api_key`, or request headers.
- Summarize actions in plain language after using the API.
