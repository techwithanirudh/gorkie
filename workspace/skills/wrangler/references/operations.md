# Wrangler: local dev, temporary deploys, troubleshooting

Everything here works without a Cloudflare account. Retrieval-first: confirm exact flags against the Cloudflare docs.

## Local Development

`wrangler dev` runs the Worker inside the sandbox with local storage for bindings. The user cannot reach it; use it to check the Worker yourself with `curl` before deploying. Start it with `execute_command` and `background: true` so it outlives the call.

```bash
# Local mode (default), uses local storage simulation
wrangler dev --port 8787

# Live reload for HTML changes
wrangler dev --live-reload

# Check it from the sandbox
curl -s http://localhost:8787/
```

Scheduled handlers can be tested locally too:

```bash
wrangler dev --test-scheduled
curl http://localhost:8787/__scheduled
```

## Deploy

```bash
# Validate without deploying
wrangler deploy --dry-run

# Deploy to a throwaway account, live for 60 minutes
wrangler deploy --temporary

# Smaller bundle
wrangler deploy --temporary --minify
```

Share both the `*.workers.dev` URL and the claim URL. Re-running `wrangler deploy --temporary` within the window reuses the same temporary account.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `command not found: wrangler` | Run `wrangler --version`; it is installed globally. Do not install it into the project. |
| Auth errors | gorkie has no account; deploy with `wrangler deploy --temporary`, never `wrangler login` |
| Startup time limit exceeded | Run `wrangler check startup` to profile startup and generate CPU profiles |
| Type errors after config change | Run `wrangler types` |
| Local storage not persisting | Check `.wrangler/state` directory |
| Binding undefined in Worker | Verify binding name matches config exactly |
