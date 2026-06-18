# Local Development Setup — Playwright/CDP + Interact

This guide covers the extra steps needed to run the full `playwright;cdp` engine locally with scrape persistence and the `POST /v2/scrape/:id/interact` endpoint.

## Prerequisites

- Docker (for Redis, RabbitMQ, nuq-postgres, playwright-service)
- `psql` CLI
- `pnpm` (workspace root)

## 1. Start the database and apply the schema

```bash
# From apps/api/
pnpm db:local
```

This runs two things in sequence:

1. Applies the Drizzle-generated migration (`drizzle/20260618153654_cynical_hannibal_king/migration.sql`) — creates all 44 app tables.
2. Applies `scripts/local-db-setup.sql` — creates stub Supabase RPC functions so auth and billing work without a cloud DB.

If the postgres container isn't running yet, start it first:

```bash
docker compose -f ../../docker-compose.yaml -f ../../docker-compose.dev.yaml up -d nuq-postgres
```

Then run `pnpm db:local` again.

## 2. Start the API

```bash
# From apps/api/
pnpm dev:local
```

This starts all Docker services (Redis, RabbitMQ, nuq-postgres, playwright-service) and then launches the harness with:

- `USE_DB_AUTHENTICATION=true` — enables scrape persistence and real auth
- `DISABLE_BLOCKLIST=true` — skips blocklist table lookups (table is empty locally)
- `DATABASE_URL` / `DATABASE_REPLICA_URL` — pointed at localhost:5432 (same container as NuQ)

## 3. Test API key

Use this key for local requests — it parses to a valid RFC 9562 UUID, which the auth middleware requires:

```
fc-3d478a296e59403e85c794aba81ffd2a
```

```bash
curl -s http://localhost:3002/v2/scrape \
  -H "Authorization: Bearer fc-3d478a296e59403e85c794aba81ffd2a" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","formats":["markdown"],"scrapeOptions":{"method":"playwright;cdp"}}' \
  | jq .
```

## 4. Test the interact endpoint

```bash
# 1. Scrape a page (note the scrapeId in the response)
SCRAPE_ID=$(curl -s http://localhost:3002/v2/scrape \
  -H "Authorization: Bearer fc-3d478a296e59403e85c794aba81ffd2a" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com","formats":["markdown"],"scrapeOptions":{"method":"playwright;cdp"}}' \
  | jq -r '.scrapeId')

# 2. Interact with the persisted scrape
curl -s "http://localhost:3002/v2/scrape/${SCRAPE_ID}/interact" \
  -H "Authorization: Bearer fc-3d478a296e59403e85c794aba81ffd2a" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"What is the main heading on this page?"}' \
  | jq .
```

## What the stub functions do

`scripts/local-db-setup.sql` creates four PostgreSQL functions that replace Supabase cloud RPCs:

| Function                               | Behavior                                                  |
| -------------------------------------- | --------------------------------------------------------- |
| `auth_credit_usage_chunk_47`           | Accepts any API key; returns 99 999 999 credits remaining |
| `auth_credit_usage_chunk_47_from_team` | Same but keyed by team_id                                 |
| `bill_team_6`                          | No-op — credits are not deducted locally                  |
| `change_tracking_insert_scrape`        | No-op — no Supabase realtime needed locally               |

The billing emulation is intentional: you can test credit-gated code paths without depleting a real quota.

## LLM backend (optional)

The API defaults to Gemini/OpenAI. To route all AI calls through a local proxy (e.g. `claude` CLI or `codex`):

```bash
# From apps/llm-proxy/
pnpm start   # starts the proxy on :4000

# Then add to your dev:local env:
LOCAL_LLM_PROXY_URL=http://localhost:4000
```

Set `LOCAL_LLM_PROXY_URL` in your shell before running `pnpm dev:local` and the proxy intercepts all `getModel()` calls.
