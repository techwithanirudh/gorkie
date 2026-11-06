# Wrangler: configuration and bindings

`wrangler.jsonc` config for what a temporary account (`wrangler deploy
--temporary`) supports: Workers, Workers Static Assets, Workers KV, D1, Durable
Objects and Queues.

Every `wrangler kv`, `wrangler d1 ... --remote`, `wrangler hyperdrive` and
`wrangler queues` management command needs a logged-in account, and gorkie
cannot log in, so they hang on the browser login. Declare bindings in config
without ids instead: `wrangler deploy` creates KV namespaces, D1 databases and
queues on the temporary account, and `wrangler dev` creates local ones.
Hyperdrive needs a `wrangler hyperdrive create` first, so it is out of reach.

## Full config with bindings

```jsonc
{
  "$schema": "/usr/local/lib/node_modules/wrangler/config-schema.json",
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],

  "vars": {
    "ENVIRONMENT": "production"
  },

  // Created by the deploy
  "kv_namespaces": [{ "binding": "KV" }],
  "d1_databases": [{ "binding": "DB", "migrations_dir": "./migrations" }],
  "queues": {
    "producers": [{ "binding": "MY_QUEUE", "queue": "my-queue" }],
    "consumers": [{ "queue": "my-queue", "max_batch_size": 10 }]
  },

  // Durable Objects need a migration that declares the class
  "durable_objects": {
    "bindings": [{ "name": "COUNTER", "class_name": "Counter" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["Counter"] }],

  "triggers": {
    "crons": ["0 * * * *"]
  }
}
```

A remote D1 database starts empty, because `wrangler d1 execute --remote` and
`migrations apply --remote` need a login. Create the schema from the Worker
itself (`CREATE TABLE IF NOT EXISTS` on first use). Locally,
`wrangler d1 migrations apply DB --local` and
`wrangler d1 execute DB --local --command "..."` work.

## Generate types from config

```bash
wrangler types                 # writes worker-configuration.d.ts
wrangler types ./src/env.d.ts  # custom output path
```

## Static assets (no-account static site hosting)

Pages always requires an account, so serve static sites (HTML/CSS/JS, no server
framework) as a Worker and deploy with `wrangler deploy --temporary`.

```jsonc
{
  "$schema": "/usr/local/lib/node_modules/wrangler/config-schema.json",
  "name": "my-site",
  "compatibility_date": "2026-01-01",
  "assets": {
    "directory": "./dist"
  }
}
```

- Omit `"main"` if the site is pure static assets with no Worker logic.
- To also run server logic (an API route alongside the static files, for
  example), keep `"main"` pointing at a Worker script and add
  `"binding": "ASSETS"` under `"assets"` so the Worker can fetch static files
  through `env.ASSETS`.
