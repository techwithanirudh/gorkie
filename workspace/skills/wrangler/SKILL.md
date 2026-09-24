---
name: wrangler
description: Cloudflare Workers CLI for deploying and developing Workers and the bindings temporary accounts support (KV, D1, Durable Objects, Hyperdrive, Queues), including static sites served as Workers assets. Use when the user asks to deploy a site, app, API, or Worker to Cloudflare, or to run/build/preview one. gorkie has no Cloudflare account, so it deploys via account-less temporary Workers deploys, never Pages, which always requires a real account. Biases towards retrieval from Cloudflare docs over pre-trained knowledge.
---

# Wrangler CLI

Your knowledge of Wrangler flags and config may be outdated. **Prefer retrieval over pre-training** for any Wrangler task.

## No Auth

gorkie has **no Cloudflare account and cannot log in**. Never run `wrangler login` or `wrangler whoami`: they will hang waiting for a browser. For static sites, serve them as a Worker with static assets instead (see [config-and-bindings.md](references/config-and-bindings.md)) and deploy with `wrangler deploy --temporary`.

Instead use **Temporary Accounts for Agents** (`--temporary`), which only works with `wrangler deploy`:

```bash
# Deploy without any account. Provisions a throwaway account, deploys, and prints
# a live *.workers.dev URL + a claim URL. The deployment stays live for 60 minutes.
wrangler deploy --temporary
```

- The account is created automatically, no signup or token. Wrangler returns a public `*.workers.dev` URL and a `https://dash.cloudflare.com/claim-preview?claimToken=...` link.
- **Always share BOTH** with the user: the live URL (to view) and the claim URL (to keep it permanently, including any bindings/databases). Unclaimed accounts auto-delete after 60 minutes.
- To iterate, edit the code and re-run `wrangler deploy --temporary` within the 60-minute window: it reuses the same temporary account.
- A fresh `*.workers.dev` subdomain may take a minute or two to get its TLS cert; a brief `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` right after deploy is normal, retry shortly.
- Temporary accounts only support Workers, Workers Static Assets, Workers KV, D1, Durable Objects, Hyperdrive, Queues, and SSL/TLS certificates. Don't reach for R2, Vectorize, Workers AI, Containers, Workflows, Pipelines, or Secrets Store: they need a real account and will fail.

## Retrieval Sources

Fetch the **latest** information before writing or reviewing Wrangler commands and config. Do not rely on baked-in knowledge for CLI flags, config fields, or binding shapes.

| Source | How to retrieve | Use for |
|--------|----------------|---------|
| Wrangler docs | `https://developers.cloudflare.com/workers/wrangler/` | CLI commands, flags, config reference |
| Wrangler config schema | `/usr/local/lib/node_modules/wrangler/config-schema.json` (wrangler is installed globally) | Config fields, binding shapes, allowed values |
| Cloudflare docs | Search tool or `https://developers.cloudflare.com/workers/` | API reference, compatibility dates/flags |

## Quick Start: New Worker

`wrangler init` and `create-cloudflare` are interactive and offer an account deploy, so write the two files by hand:

```jsonc
// wrangler.jsonc
{
  "$schema": "/usr/local/lib/node_modules/wrangler/config-schema.json",
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-01"
}
```

```ts
// src/index.ts
export default {
  async fetch(request: Request): Promise<Response> {
    return new Response('Hello from gorkie');
  },
};
```

## Quick Reference: Core Commands

These all work without an account.

| Task | Command |
|------|---------|
| Deploy (live 60 minutes) | `wrangler deploy --temporary` |
| Deploy dry run | `wrangler deploy --dry-run` |
| Local dev server, for your own `curl localhost:8787` checks (the user cannot reach it) | `wrangler dev` |
| Generate TypeScript types | `wrangler types` |
| Profile Worker startup time | `wrangler check startup` |

## References

For anything past a basic deploy, load the detail files (retrieval-first, confirm exact flags against the Cloudflare docs):

- [config-and-bindings.md](references/config-and-bindings.md): full `wrangler.jsonc` config, type generation, static assets, and the CLI for every binding a temporary account supports (KV, D1, Durable Objects, Hyperdrive, Queues).
- [operations.md](references/operations.md): local dev, temporary deploys, and troubleshooting.

## Best Practices

1. **Use Wrangler over raw API calls**: it is preinstalled globally (`wrangler --version`, v4.x+); prefer it to hand-built requests.
2. **Prefer `wrangler.jsonc`** over TOML: newer features are JSON-only.
3. **Set a recent `compatibility_date`**. Check https://developers.cloudflare.com/workers/configuration/compatibility-dates/
4. **Omit resource IDs** for bindings and let the deploy create them.
5. **Never embed secrets** in code, config, or commands: a temporary Worker is public.
