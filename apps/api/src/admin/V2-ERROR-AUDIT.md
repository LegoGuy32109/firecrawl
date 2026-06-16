# v2 API Error & Transparency Audit

Full sweep of every v2 endpoint, focused on errors a **customer cannot diagnose from the
response**. Companion to [RESPONSE-MODEL.md](./RESPONSE-MODEL.md) (the target envelope).

Goal: transparency to build trust. A developer should always be able to answer "why did
this happen and what do I do next?" from the response body alone — without a support ticket.

> File:line references below were gathered by source analysis; spot-check each before
> changing code, as line numbers drift.

---

## The six cross-cutting patterns

Every endpoint-specific gap is an instance of one of these. Fix the pattern once, apply
everywhere.

### P1 — `code` is the linchpin and it's wildly inconsistent

Machine-readable `code` is the difference between a client that can branch on failure and
one that regexes a string. Current state by surface:

| Surface                                                                | `code` present?                           |
| ---------------------------------------------------------------------- | ----------------------------------------- |
| scrape, parse                                                          | ✅ rich (`TransportableError`)            |
| crawl **per-page** errors                                              | ✅ present (good) — but see P2 (filtered) |
| search                                                                 | ❌ none — failures swallowed to `{}`      |
| map                                                                    | ⚠️ only `MAP_TIMEOUT`                     |
| extract, agent                                                         | ❌ none at all                            |
| browser, monitor, support/research proxy                               | ❌ none                                   |
| auth, credits, rate-limit, blocklist, country, idempotency, queue-full | ❌ none (plain strings)                   |

→ **Required `code` on every error response, no exceptions.** Expand `ErrorCodes` to cover
auth/credit/rate-limit/dependency/extract/agent/map cases (taxonomy below).

### P2 — "Successful" responses hide failed operations (biggest trust-killer)

A `200 { success: true }` that conceals a failure is worse than an error — the dev doesn't
even know to look.

- **search** swallows all provider errors → `{ success: true, data: {}, creditsUsed: 0 }`.
  Network error, 429, misconfig, and genuine zero-results are indistinguishable.
  (`search/v2/index.ts:81`)
- **map** returns `success: true` with 3 URLs for a 1000-page site; sitemap-fetch failure
  is caught and ignored (`map-utils.ts:258`), path-filter drops are invisible.
- **crawl/batch** return `200 { success: true, id }` at kickoff; a `QueueFullError` thrown
  during async kickoff only surfaces on the next status poll (`crawl.ts:261`,
  `scrape-worker.ts:1151`).
- **browser execute** returns `success: true` even when `exitCode !== 0` / `killed`
  (`browser.ts:485`).
- **extract** truncates content over token limit and returns partial JSON with no signal
  (`llmExtract-f0.ts:102`); multi-entity per-doc failures return `null` silently.
- **browser delete / webhook / research proxy** return `200 OK` even when the
  external-service teardown or **billing** failed (`browser.ts:537,589,597`,
  `research-proxy.ts:310`).
- **crawl "completed" 2 of 500** — status carries no failure count or reason summary.

→ **Honesty rule:** a 2xx must not hide a failed sub-operation. Use partial-status fields —
per-source, per-URL, per-action, queue breakdown — and `warning` entries that carry a `code`.

### P3 — Many distinct causes collapse into one generic response

The dev can't pick a remedy because the response doesn't say which problem they have.

- **401 "Unauthorized: Invalid token"** = malformed key / nonexistent / suspended team /
  **DB outage after 5 retries** — all identical (`auth.ts:759`, retry loop `:277`).
- **404 "Job not found"** = never existed / expired (24h TTL) / wrong team / unauth — across
  crawl-status, crawl-errors, scrape-status, cancel, WS (`crawl-status.ts:203`).
- **402 "Insufficient credits"** — no required/balance numbers, though the server has both
  (`shared.ts:177`).
- **429 rate limit** — shows consumed/remaining but **not the actual limit**, so the dev
  can't tell if their cap is 15 or 100/min (`auth.ts:788`).
- **403 blocklist** — generic "we don't support this site," no reason, no per-team vs global
  (`shared.ts:271`).
- **extract failure** — schema mismatch / LLM refusal / token limit / scrape-failed all map
  to one "unexpected error" (`extract-worker.ts:86`, `llmExtract-f0.ts:451`).

→ Disambiguate with distinct codes (`INVALID_API_KEY` vs `AUTH_BACKEND_UNAVAILABLE`;
`JOB_NOT_FOUND` vs `JOB_EXPIRED` vs `JOB_WRONG_TEAM`) and structured `details`.

### P4 — External-dependency failures are swallowed or mislabeled

Customer can't tell "my request was bad" from "Firecrawl's dependency is down."

- **browser service**: 3 retries then generic `502 "Failed to create browser session"` —
  auth? down? timeout? profile exhaustion? unknown (`browser.ts:259`).
- **Autumn (billing) down → fails OPEN**: `checkCredits` returns null → request proceeds
  with `Infinity` credits, unlogged to client (`shared.ts:136`, `autumn.service.ts:387`).
- **GCS**: monitor diff 502 propagates as unhandled `500` on a check that actually
  succeeded; 404 returns blank diff silently (`gcs-monitoring.ts:80`, `monitor.ts:512`).
- **support/research proxy**: upstream 5xx/timeout → empty-body `502/504`, no detail
  (`support-proxy.ts:57`, `research-proxy.ts:343`).
- **LLM provider** rate-limit/refusal in extract → collapses to generic "LLM extraction
  failed."

→ Reserve `502/503` + a `DEPENDENCY_*` code for upstream failures, distinct from `4xx` user
errors. Never silently fail-open billing — if the gate is bypassed, say so.

### P5 — The server knows; the client is told nothing

Rich detail lands in logs/Sentry; the client gets a generic message and (sometimes) an
`errorId`. Gaps: `errorId` is missing from the body on many paths; no request/trace-id
correlation header; no per-source / per-URL / per-action attribution anywhere.

→ `errorId` in **every** error body. Propagate a trace id. Add a `diagnostics` block
(default-on per RESPONSE-MODEL.md) carrying the attribution that already exists internally.

### P6 — Billing/credit accounting is opaque and inconsistent

Fail-open on Autumn outage (P4), `200 OK` when `billTeam` fails (`research-proxy.ts:310`,
`browser.ts:589`), credits charged before upstream completes, no balance ever returned.

→ Surface billing outcome (`creditsUsed`, and on failure whether the op was still performed)
and never return success masking a billing failure without a `warning` + `code`.

---

## Per-endpoint highlights (worst diagnostic gaps)

**search** — #1 priority. Swallow-to-`{}` (P2). No per-source status. Add
`sources: { web: {status, count}, news: {status:"failed", code:"PROVIDER_RATE_LIMIT"} }`.

**scrape / parse** — Already the best (rich codes). Remaining: worker→API boundary can drop
`TransportableError.code` (`scrape-worker.ts:767`); GCS save is fire-and-forget.

**crawl / batch** — Async kickoff failures hidden (P2). No failure aggregation on status
(add `failureCount` + `failuresByCode`). No `active/queued/backlog` breakdown — a "stuck"
crawl is undiagnosable. Raced-redirects filtered from `/errors` (`crawl-errors.ts:53`) —
dev sees "500/500" but 50 were silently deduped. robots-blocked split into a separate list.
WS close codes (1008/3003/3000) carry no machine `code`. ZDR scrape-status fails with no
`code` (`scrape-status.ts:25`).

**map** — `success:true` with degraded results (P2). No source attribution (index/search/
sitemap), no count of path-filter drops, silent sitemap + avgrab-fallback failures.

**extract / agent** — No codes at all (P1). LLM refusal reason, schema-mismatch field,
token-truncation, and per-URL scrape failures all collapse to "unexpected error" /
"Failed to passthrough agent request" (`agent.ts:106` discards upstream status+body).

**browser** — Generic `502` on service failure (P4). `success:true` on nonzero exit (P2).
DB-insert failure after service create → orphaned session (`browser.ts:327`). Delete/webhook
billing failures → `200 OK` (P6).

**monitor** — No codes. Email recipient sync failure swallowed (`monitor.ts:219`). Token
confirm: expired vs never-issued vs malformed all → `not_found`. GCS diff failure → `500`
on a completed check.

**support / research proxy** — Empty-body `502/504` (P4). Research misconfig returns bare
`404` (looks like wrong URL). Billing-before-completion (P6).

---

## Target: expanded `ErrorCodes` taxonomy

Group by domain so clients can branch on prefix. (Existing scrape codes kept.)

- **Auth:** `INVALID_API_KEY`, `MISSING_API_KEY`, `KEY_NOT_KEYLESS_ELIGIBLE`,
  `TEAM_SUSPENDED`, `AUTH_BACKEND_UNAVAILABLE`, `OAUTH_TOKEN_EXPIRED`
- **Credits/billing:** `INSUFFICIENT_CREDITS` (+`details:{required,balance,shortfall}`),
  `UNVERIFIED_CREDIT_LIMIT`, `SPONSOR_VERIFICATION_EXPIRED` (+deadline), `BILLING_UNAVAILABLE`
- **Rate/queue:** `RATE_LIMIT_EXCEEDED` (+`details:{limit,remaining,reset_at,scope}`),
  `QUEUE_FULL` (+`details:{queued,limit}`)
- **Request gating:** `URL_BLOCKED` (+reason), `COUNTRY_RESTRICTED` (+country),
  `IDEMPOTENCY_CONFLICT` (+pointer to original result)
- **Job lifecycle:** `JOB_NOT_FOUND`, `JOB_EXPIRED`, `JOB_WRONG_TEAM`, `JOB_CANCELLED`,
  `ZDR_NOT_SUPPORTED`
- **Extract/agent:** `EXTRACT_NO_VALID_URLS`, `EXTRACT_SCHEMA_MISMATCH`,
  `EXTRACT_LLM_REFUSAL`, `EXTRACT_CONTENT_TRUNCATED`, `EXTRACT_SCRAPE_FAILED`,
  `AGENT_UPSTREAM_ERROR`
- **Map:** `MAP_NO_RESULTS`, `MAP_SITEMAP_FAILED` (non-fatal warning code)
- **Dependency:** `DEPENDENCY_UNAVAILABLE`, `DEPENDENCY_TIMEOUT` (browser svc, GCS, proxies,
  LLM) — paired with `502/503`.

---

## Prioritized fixes (impact × reach)

1. **Search per-source status** — fixes the worst black hole, template for `diagnostics`.
2. **Required `code` + `errorId` in every error body** — shared types + central
   `errorCodeToHttpStatus`; migrate endpoints onto it. Unlocks P1/P3 everywhere.
3. **Credit/rate-limit `details`** — return required/balance and the actual limit. Highest
   support-ticket reducer, tiny change (`shared.ts:177`, `auth.ts:788`).
4. **Disambiguate auth 401 & job 404** — `AUTH_BACKEND_UNAVAILABLE`, `JOB_EXPIRED`, etc.
5. **Crawl status honesty** — `failureCount` + `failuresByCode` + `active/queued/backlog`
   breakdown; stop hiding async kickoff errors.
6. **Dependency error class** — `502/503` + `DEPENDENCY_*` for browser/GCS/proxy/LLM;
   stop silent billing fail-open.
7. **Extract/agent + map codes** — surface refusal/schema/truncation reasons and map source
   attribution.
8. **`success:true` honesty pass** — browser-exec nonzero exit, billing-failed-on-delete,
   map degraded results all must signal.
