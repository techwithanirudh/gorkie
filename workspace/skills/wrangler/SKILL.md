---
name: wrangler
description: Cloudflare Workers CLI for deploying and developing Workers, Pages sites, and bindings (KV, R2, D1, etc.). Use when the user asks to deploy a site, app, API, or Worker to Cloudflare, or to run/build/preview one. gorkie has no Cloudflare account, so it deploys via account-less temporary deploys. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.
---

# Wrangler CLI

Your knowledge of Wrangler flags and config may be outdated. **Prefer retrieval over pre-training** for any Wrangler task.

## No Auth

gorkie has **no Cloudflare account and cannot log in**. Never run `wrangler login` or `wrangler whoami` — they will hang waiting for a browser. Instead use **Temporary Accounts for Agents** (`--temporary`):

```bash
# Deploy without any account. Provisions a throwaway account, deploys, and prints
# a live *.workers.dev URL + a claim URL. The deployment stays live for 60 minutes.
wrangler deploy --temporary
```

- The account is created automatically, no signup or token. Wrangler returns a public `*.workers.dev` URL and a `https://dash.cloudflare.com/claim-preview?claimToken=...` link.
- **Always share BOTH** with the user: the live URL (to view) and the claim URL (to keep it permanently, including any bindings/databases). Unclaimed accounts auto-delete after 60 minutes.
- To iterate, edit the code and re-run `wrangler deploy --temporary` within the 60-minute window — it reuses the same temporary account.
- A fresh `*.workers.dev` subdomain may take a minute or two to get its TLS cert; a brief `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` right after deploy is normal, retry shortly.

Wrangler is pre-installed in gorkie’s environment.

## Retrieval Sources

Fetch the **latest** information before writing or reviewing Wrangler commands and config. Do not rely on baked-in knowledge for CLI flags, config fields, or binding shapes.

| Source | How to retrieve | Use for |
|--------|----------------|---------|
| Wrangler docs | `https://developers.cloudflare.com/workers/wrangler/` | CLI commands, flags, config reference |
| Wrangler config schema | `node_modules/wrangler/config-schema.json` | Config fields, binding shapes, allowed values |
| Cloudflare docs | Search tool or `https://developers.cloudflare.com/workers/` | API reference, compatibility dates/flags |

## Key Guidelines

- **Use Wrangler over raw API calls**: it is preinstalled (`wrangler --version`, v4.x+); prefer it to hand-built requests.
- **Use `wrangler.jsonc`**: Prefer JSON config over TOML. Newer features are JSON-only.
- **Set `compatibility_date`**: Use a recent date (within 30 days). Check https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- **Generate types after config changes**: Run `wrangler types` to update TypeScript bindings.
- **Local dev defaults to local storage**: Bindings use local simulation unless `remote: true`.
- **Profile Worker startup**: Run `wrangler check startup` to measure startup time and detect scripts that exceed the startup time limit.
- **Use environments for staging/prod**: Define `env.staging` and `env.production` in config.

## Quick Start: New Worker

```bash
# Initialize new project
npx wrangler init my-worker

# Or with a framework
npx create-cloudflare@latest my-app
```

## Quick Reference: Core Commands

| Task | Command |
|------|---------|
| Start local dev server | `wrangler dev` |
| Deploy to Cloudflare | `wrangler deploy` |
| Deploy dry run | `wrangler deploy --dry-run` |
| Generate TypeScript types | `wrangler types` |
| Profile Worker startup time | `wrangler check startup` |
| View live logs | `wrangler tail` |
| Delete Worker | `wrangler delete` |
| Auth status | n/a — gorkie has no account; deploys with `--temporary`, never logs in |

---

## Configuration (wrangler.jsonc)

### Minimal Config

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-01"
}
```

## References

For anything past a basic deploy, load the detail files (retrieval-first — confirm exact flags against the Cloudflare docs):

- [config-and-bindings.md](references/config-and-bindings.md) — full `wrangler.jsonc` config, type generation, and the CLI for every binding (KV, R2, D1, Vectorize, Hyperdrive, Workers AI, Queues, Containers, Workflows, Pipelines, Secrets Store).
- [operations.md](references/operations.md) — local dev, deployment (secrets, versions/rollback), Pages, observability/tail, testing, and troubleshooting.

## Best Practices

1. **Version control `wrangler.jsonc`**: Treat as source of truth for Worker config.
2. **Use automatic provisioning**: Omit resource IDs for auto-creation on deploy.
3. **Run `wrangler types` in CI**: Add to build step to catch binding mismatches.
4. **Use environments**: Separate staging/production with `env.staging`, `env.production`.
5. **Set `compatibility_date`**: Update quarterly to get new runtime features.
6. **Use `.dev.vars` for local secrets**: Never commit secrets to config.
7. **Test locally first**: `wrangler dev` with local bindings before deploying.
8. **Use `--dry-run` before major deploys**: Validate changes without deployment.
9. **Never embed secrets in commands**: Use interactive prompts (`wrangler secret put`), file-based input (`wrangler secret bulk`), or secure CI environment variables. Never echo, log, or pass secret values as CLI arguments.
