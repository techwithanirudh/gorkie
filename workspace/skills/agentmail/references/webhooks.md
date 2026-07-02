# AgentMail Webhooks

Use webhooks when the user explicitly wants AgentMail to call a public HTTP endpoint for new mail or delivery events. For Gorkie itself, prefer polling or WebSockets unless the user has provided a stable endpoint.

## Create And Manage Webhooks

```python
from agentmail import AgentMail

client = AgentMail(api_key="brokered-by-gorkie")

webhook = client.webhooks.create(
    url="https://example.com/webhooks/agentmail",
    event_types=["message.received"],
)

webhooks = client.webhooks.list()

client.webhooks.delete(webhook_id=webhook.webhook_id)
```

Never create a webhook to a third-party URL unless the user explicitly approves the destination and event types.

## Event Types

| Event | Meaning |
|---|---|
| `message.received` | New email received |
| `message.sent` | Email sent |
| `message.delivered` | Recipient server accepted the email |
| `message.bounced` | Delivery failed |
| `message.complained` | Recipient marked the email as spam |
| `message.rejected` | Email rejected before send |
| `domain.verified` | Custom domain verification completed |

## Payload Shape

```json
{
  "type": "event",
  "event_type": "message.received",
  "event_id": "evt_123",
  "message": {
    "inbox_id": "gorkie@agentmail.to",
    "thread_id": "thd_123",
    "message_id": "msg_123",
    "from": "Jane Doe <jane@example.com>",
    "to": ["gorkie@agentmail.to"],
    "subject": "Question",
    "text": "Body",
    "html": "<p>Body</p>",
    "labels": ["received"],
    "attachments": []
  }
}
```

## Python Endpoint Example

```python
from flask import Flask, request

app = Flask(__name__)

@app.route("/webhooks/agentmail", methods=["POST"])
def handle_webhook():
    payload = request.json
    if payload["event_type"] == "message.received":
        process_email(payload["message"])
    return "OK", 200
```

Return `200 OK` quickly. Do slow work in a queue or background task.

## Signature Verification

```python
import hashlib
import hmac

def verify_signature(payload: bytes, signature, secret: str) -> bool:
    if not isinstance(signature, str) or not signature:
        return False
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

@app.route("/webhooks/agentmail", methods=["POST"])
def handle_webhook():
    signature = request.headers.get("X-AgentMail-Signature")
    if not verify_signature(request.data, signature, WEBHOOK_SECRET):
        return "Invalid signature", 401
    payload = request.json
    process_event(payload)
    return "OK", 200
```

Do not log raw payloads if they contain private message bodies.
