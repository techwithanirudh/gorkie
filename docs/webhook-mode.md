# Webhook mode

Slack delivers events and interactivity to gorkie over HTTP. There is no Socket
Mode connection and no `SLACK_APP_TOKEN`.

## How requests arrive

- Mastra channels registers `POST /api/agents/orchestrator/channels/slack/webhook`
  as a public route (`requiresAuth: false`). The Slack adapter verifies every
  request with `SLACK_SIGNING_SECRET` (HMAC, 300 second clock skew, so keep NTP
  running on the host) and answers `url_verification` itself.
- Events and `block_actions` are acknowledged immediately and handled in the
  background of the long-lived process, exactly as Socket Mode did. Modal
  submissions (`view_submission`) are awaited, so their handlers must finish
  within Slack's 3 seconds.
- Slack retries a delivery it did not get a 200 for. The adapter's in-process
  duplicate checks (`slack:event-delivered:<event_id>` and the per-message
  dedupe) drop retries the process already handled. gorkie deliberately does
  not drop `x-slack-retry-reason: http_timeout` retries the way a serverless
  deployment does: on one long-lived process a retry that reaches us was either
  already handled (and is dropped by the dedupe) or never ran (for example
  across a restart) and must run.
- `appToken` is never passed to the adapter. With it set, the adapter would also
  accept unsigned requests carrying `x-slack-socket-token`.

## The public surface

Three layers, so one mistake does not expose the agent API:

1. **Bind to loopback.** `server.host` is `HOST` (default `127.0.0.1`). Mastra
   otherwise listens on every interface. Check the running host:

   ```sh
   ss -ltnp | grep 4111
   ```

   `127.0.0.1:4111` is correct. `*:4111` or `0.0.0.0:4111` means the whole API
   (`/api/agents/*`, memory, workflows) is reachable by anyone who can reach
   the port; firewall it and fix `HOST`.
2. **Allowlist at the tunnel.** Only the Slack webhook, `/health`, and the
   OAuth routes under `/oauth/` are forwarded. Everything else gets a 404
   before it reaches the process.
3. **Token on everything else.** With `GORKIE_API_TOKEN` set, `SimpleAuth`
   requires `Authorization: Bearer <token>` on every non-public route. A server
   middleware also returns 404 for any non-public request that carries
   `cf-connecting-ip` or `x-forwarded-for`, so a tunnel or proxy can never reach
   Studio or the agent API even with a leaked token. This relies on the proxy
   setting one of those headers (cloudflared sets `cf-connecting-ip`); put a
   proxy that sets neither in front and only the token guards those routes.
   Operators use the loopback
   address, for example
   `mastra api --header "Authorization: Bearer $GORKIE_API_TOKEN" ...`.

Never pass the token as `?apiKey=` (it lands in proxy logs), and never build
production with `--studio`.

## Production ingress: Cloudflare named tunnel

`cloudflared` makes an outbound connection, so the host opens no inbound ports
and needs no certificates.

```sh
cloudflared tunnel login
cloudflared tunnel create gorkie
cloudflared tunnel route dns gorkie <your-host>
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: gorkie
credentials-file: /etc/cloudflared/<tunnel-id>.json

ingress:
  - hostname: <your-host>
    path: ^/api/agents/orchestrator/channels/slack/webhook$
    service: http://127.0.0.1:4111
  - hostname: <your-host>
    path: ^/health$
    service: http://127.0.0.1:4111
  # Sign-in: GET/POST /oauth/{github,mcp}/start, GET /oauth/{github,mcp}/callback,
  # GET /oauth/github/installed.
  - hostname: <your-host>
    path: ^/oauth/(github|mcp)/(start|callback|installed)$
    service: http://127.0.0.1:4111
  - service: http_status:404
```

`/etc/systemd/system/cloudflared.service`:

```ini
[Unit]
Description=Cloudflare tunnel for gorkie
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/cloudflared --no-autoupdate --config /etc/cloudflared/config.yml tunnel run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```sh
systemctl daemon-reload && systemctl enable --now cloudflared
```

Keep request logging off on the tunnel, or strip query strings: OAuth callback
URLs will carry `code` and `state`.

## Process supervision

The systemd unit and any health monitor live on the host, not in this repo.
Two things they must get right:

- **Probe `/health`.** `http://127.0.0.1:4111/health` is public. With
  `SimpleAuth` on, every `/api` route answers 401, so a monitor probing one
  would restart the bot in a loop.
- **Give shutdown time to drain.** On SIGTERM the bot waits up to
  `shutdown.drainTimeoutMs` (120 s in production, `src/mastra/config.ts`) for
  Slack turns, and Mastra can spend one such window on HTTP and another on its
  own shutdown. Set the unit's `TimeoutStopSec` above twice that plus 5 s,
  for example `TimeoutStopSec=250`, or systemd kills in-flight turns.

Never run two processes side by side, including for a handover. Both would
run the Mastra scheduler and workers against the same Postgres, and scheduled
tasks could fire twice.

## Development

Create the `gorkie (dev)` app from
[`slack-manifest.dev.json`](../slack-manifest.dev.json) with its own signing
secret, set `GORKIE_API_TOKEN` in `.env`, then run `bun run dev:e2e` (or
`bun run dev` and `bun run dev:tunnel`). Paste the printed tunnel host plus
`/api/agents/orchestrator/channels/slack/webhook` into both request URLs. The
quick-tunnel URL changes on every run; a named Cloudflare tunnel with a fixed
dev hostname removes that step.

## Risks

- If most deliveries fail for a long stretch, Slack disables Event
  Subscriptions and they must be re-enabled by hand. Socket Mode had no
  equivalent.
- Duplicate markers live in memory. A delivery that timed out, was dispatched,
  and whose retry arrives after a restart can produce a second reply.
- The host clock must stay within 300 seconds of Slack's, or every request
  fails signature verification.
