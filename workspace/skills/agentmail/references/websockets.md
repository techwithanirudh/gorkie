# AgentMail WebSockets

Use WebSockets for live inbox events without exposing a public webhook endpoint.

## Sync Listener

```python
from agentmail import AgentMail, MessageReceivedEvent, Subscribe, Subscribed

client = AgentMail(api_key="brokered-by-gorkie")

with client.websockets.connect() as socket:
    socket.send_subscribe(Subscribe(inbox_ids=["gorkie@agentmail.to"]))

    for event in socket:
        if isinstance(event, Subscribed):
            print("Subscribed:", event.inbox_ids)
        elif isinstance(event, MessageReceivedEvent):
            print("From:", event.message.from_)
            print("Subject:", event.message.subject)
```

## Async Listener

```python
import asyncio
from agentmail import AsyncAgentMail, MessageReceivedEvent, Subscribe

client = AsyncAgentMail(api_key="brokered-by-gorkie")

async def main():
    async with client.websockets.connect() as socket:
        await socket.send_subscribe(
            Subscribe(inbox_ids=["gorkie@agentmail.to"])
        )

        async for event in socket:
            if isinstance(event, MessageReceivedEvent):
                print("New:", event.message.subject)

asyncio.run(main())
```

## Subscribe Filters

```python
from agentmail import Subscribe

Subscribe(inbox_ids=["gorkie@agentmail.to"])
Subscribe(pod_ids=["pod_123"])
Subscribe(
    inbox_ids=["gorkie@agentmail.to"],
    event_types=["message.received", "message.sent"],
)
```

## Event Classes

| Event | Python class |
|---|---|
| Subscription confirmed | `Subscribed` |
| New email received | `MessageReceivedEvent` |
| Email sent | `MessageSentEvent` |
| Email delivered | `MessageDeliveredEvent` |
| Email bounced | `MessageBouncedEvent` |
| Spam complaint | `MessageComplainedEvent` |
| Email rejected | `MessageRejectedEvent` |
| Domain verified | `DomainVerifiedEvent` |

## Message Fields

Common fields on `event.message`:

| Field | Meaning |
|---|---|
| `inbox_id` | Inbox that received the email |
| `message_id` | Message id |
| `thread_id` | Conversation thread id |
| `from_` | Sender address |
| `to` | Recipient list |
| `subject` | Subject line |
| `text` | Plain text body |
| `html` | HTML body |
| `extracted_text` | Reply content with quoted history stripped |
| `attachments` | Attachments |
| `labels` | Labels |

## Errors

```python
from agentmail import AsyncAgentMail, MessageReceivedEvent, Subscribe
from agentmail.core.api_error import ApiError

client = AsyncAgentMail(api_key="brokered-by-gorkie")

async def main():
    try:
        async with client.websockets.connect() as socket:
            await socket.send_subscribe(
                Subscribe(inbox_ids=["gorkie@agentmail.to"])
            )
            async for event in socket:
                if isinstance(event, MessageReceivedEvent):
                    await process_email(event.message)
    except ApiError as error:
        print(f"API error: {error.status_code}")
    except Exception as error:
        print(f"Connection error: {error}")
```

Avoid logging full message bodies unless the user requested inspection.
