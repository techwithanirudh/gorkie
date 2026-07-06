# Wrangler: configuration & service bindings

Full `wrangler.jsonc` config plus the CLI reference for each Cloudflare service
gorkie can actually use through a temporary account (`wrangler deploy
--temporary`): Workers, Workers Static Assets, Workers KV, D1, Durable
Objects, Hyperdrive, Queues, and SSL/TLS certificates only. Cloudflare has
not extended temporary-account support to other products yet. Retrieval-first:
confirm exact flags and binding shapes against the Cloudflare docs before
using.

### Full Config with Bindings

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-01-01",
  "compatibility_flags": ["nodejs_compat"],

  // Environment variables
  "vars": {
    "ENVIRONMENT": "production"
  },

  // KV Namespace
  "kv_namespaces": [
    { "binding": "KV", "id": "<KV_NAMESPACE_ID>" }
  ],

  // D1 Database
  "d1_databases": [
    { "binding": "DB", "database_name": "my-db", "database_id": "<DB_ID>" }
  ],

  // Hyperdrive
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "<HYPERDRIVE_ID>" }
  ],

  // Durable Objects
  "durable_objects": {
    "bindings": [
      { "name": "COUNTER", "class_name": "Counter" }
    ]
  },

  // Cron triggers
  "triggers": {
    "crons": ["0 * * * *"]
  },

  // Environments
  "env": {
    "staging": {
      "name": "my-worker-staging",
      "vars": { "ENVIRONMENT": "staging" }
    }
  }
}
```

### Generate Types from Config

```bash
# Generate worker-configuration.d.ts
wrangler types

# Custom output path
wrangler types ./src/env.d.ts

# Check types are up to date (CI)
wrangler types --check
```

## Static Assets (no-account static site hosting)

Since gorkie has no Cloudflare account and Pages always requires one, serve static
sites (HTML/CSS/JS, no server framework) as a Worker instead, then deploy with
`wrangler deploy --temporary` like any other Worker.

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-site",
  "compatibility_date": "2026-01-01",
  "assets": {
    "directory": "./dist"
  }
}
```

- Omit `"main"` if the site is pure static assets with no Worker logic.
- To also run server logic (e.g. an API route alongside the static files), keep
  `"main"` pointing at a Worker script and add `"binding": "ASSETS"` under
  `"assets"` so the Worker can fetch static files via `env.ASSETS`.

## KV (Key-Value Store)

### Manage Namespaces

```bash
# Create namespace
wrangler kv namespace create MY_KV

# List namespaces
wrangler kv namespace list

# Delete namespace
wrangler kv namespace delete --namespace-id <ID>
```

### Manage Keys

```bash
# Put value
wrangler kv key put --namespace-id <ID> "key" "value"

# Put with expiration (seconds)
wrangler kv key put --namespace-id <ID> "key" "value" --expiration-ttl 3600

# Get value
wrangler kv key get --namespace-id <ID> "key"

# List keys
wrangler kv key list --namespace-id <ID>

# Delete key
wrangler kv key delete --namespace-id <ID> "key"

# Bulk put from JSON
wrangler kv bulk put --namespace-id <ID> data.json
```

### Config Binding

```jsonc
{
  "kv_namespaces": [
    { "binding": "CACHE", "id": "<NAMESPACE_ID>" }
  ]
}
```

---

## D1 (SQL Database)

### Manage Databases

```bash
# Create database
wrangler d1 create my-database

# Create with location
wrangler d1 create my-database --location wnam

# List databases
wrangler d1 list

# Get database info
wrangler d1 info my-database

# Delete database
wrangler d1 delete my-database
```

### Execute SQL

```bash
# Execute SQL command (remote)
wrangler d1 execute my-database --remote --command "SELECT * FROM users"

# Execute SQL file (remote)
wrangler d1 execute my-database --remote --file ./schema.sql

# Execute locally
wrangler d1 execute my-database --local --command "SELECT * FROM users"
```

### Migrations

```bash
# Create migration
wrangler d1 migrations create my-database create_users_table

# List pending migrations
wrangler d1 migrations list my-database --local

# Apply migrations locally
wrangler d1 migrations apply my-database --local

# Apply migrations to remote
wrangler d1 migrations apply my-database --remote
```

### Export/Backup

```bash
# Export schema and data
wrangler d1 export my-database --remote --output backup.sql

# Export schema only
wrangler d1 export my-database --remote --output schema.sql --no-data
```

### Config Binding

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-database",
      "database_id": "<DATABASE_ID>",
      "migrations_dir": "./migrations"
    }
  ]
}
```

---

## Hyperdrive (Database Accelerator)

### Manage Configs

```bash
# Create config
wrangler hyperdrive create my-hyperdrive \
  --origin-host db.example.com \
  --origin-port 5432 \
  --database my-database \
  --origin-user db-user \
  --origin-password "$DB_PASSWORD"

# Or using a connection string from an environment variable
wrangler hyperdrive create my-hyperdrive \
  --connection-string "$HYPERDRIVE_CONNECTION_STRING"

# List configs
wrangler hyperdrive list

# Get config details
wrangler hyperdrive get <HYPERDRIVE_ID>

# Update config
wrangler hyperdrive update <HYPERDRIVE_ID> \
  --origin-password "$DB_PASSWORD"

# Delete config
wrangler hyperdrive delete <HYPERDRIVE_ID>
```

### Config Binding

```jsonc
{
  "compatibility_flags": ["nodejs_compat"],
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "<HYPERDRIVE_ID>" }
  ]
}
```

---

## Queues

### Manage Queues

```bash
# Create queue
wrangler queues create my-queue

# List queues
wrangler queues list

# Delete queue
wrangler queues delete my-queue

# Add consumer to queue
wrangler queues consumer add my-queue my-worker

# Remove consumer
wrangler queues consumer remove my-queue my-worker
```

### Config Binding

```jsonc
{
  "queues": {
    "producers": [
      { "binding": "MY_QUEUE", "queue": "my-queue" }
    ],
    "consumers": [
      {
        "queue": "my-queue",
        "max_batch_size": 10,
        "max_batch_timeout": 30
      }
    ]
  }
}
```
