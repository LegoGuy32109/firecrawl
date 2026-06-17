# Spec — ErrorCodes Expansion & Response Envelope

Implementation spec for **Phase 1** of [LOCAL-PLAYGROUND.md](./LOCAL-PLAYGROUND.md). Realizes the
[V2-ERROR-AUDIT.md](./V2-ERROR-AUDIT.md) fixes and the [RESPONSE-MODEL.md](./RESPONSE-MODEL.md)
envelope **on responses only**.

**Hard constraint:** v2 **request/input** shapes are frozen. Only **response** bodies and HTTP
status codes change. (Owner decision, Branch 7: _additive + status-code normalization_.)

> Refs marked ✓ read directly.

---

## 1. Current state (verified)

- `ErrorCodes` is a **string-union type** of 35 members, mostly `SCRAPE_*` (`lib/error.ts:1-35` ✓).
- `TransportableError` base carries `code` but `serialize()` returns only
  `{ cause, stack, message }` — **`details` is not transported today** (`lib/error.ts:45-51` ✓).
- Envelope `ErrorResponse = { success:false, code?:ErrorCodes, error:string, details?:any,
sponsor_status?, login_url? }` — `code` **optional**, `details` untyped, **no `errorId`, no
  `diagnostics`** (`controllers/v2/types.ts:1314` ✓).
- ~40 error subclasses across `lib/error.ts` + `scraper/scrapeURL/error.ts` (✓). Some are plain
  `Error` (internal-only, never reach the client): `EngineError`, `AddFeatureError`,
  `RemoveFeatureError`, `IndexMissError`, `FEPageLoadFailed`, `EngineSnipedError`,
  `EngineUnsuccessfulError`, `WaterfallNextEngineSignal`, `JobCancelledError` (✓).
- Auth / credits / rate-limit / blocklist / country / idempotency / queue paths emit **bare
  strings, no code** (V2-ERROR-AUDIT P1).

---

## 2. Target `ErrorCodes` (additions)

Keep all 35 existing codes. Add the groups below. The union stays a plain string-union (no enum,
to match current style).

```ts
// Auth
| "INVALID_API_KEY" | "MISSING_API_KEY" | "KEY_NOT_KEYLESS_ELIGIBLE"
| "TEAM_SUSPENDED" | "AUTH_BACKEND_UNAVAILABLE" | "OAUTH_TOKEN_EXPIRED"
// Credits / billing
| "INSUFFICIENT_CREDITS" | "UNVERIFIED_CREDIT_LIMIT"
| "SPONSOR_VERIFICATION_EXPIRED" | "BILLING_UNAVAILABLE"
// Rate / queue
| "RATE_LIMIT_EXCEEDED" | "QUEUE_FULL"
// Request gating
| "URL_BLOCKED" | "COUNTRY_RESTRICTED" | "IDEMPOTENCY_CONFLICT"
// Job lifecycle
| "JOB_NOT_FOUND" | "JOB_EXPIRED" | "JOB_WRONG_TEAM" | "JOB_CANCELLED"
| "ZDR_NOT_SUPPORTED"
// Extract / agent
| "EXTRACT_NO_VALID_URLS" | "EXTRACT_SCHEMA_MISMATCH" | "EXTRACT_LLM_REFUSAL"
| "EXTRACT_CONTENT_TRUNCATED" | "EXTRACT_SCRAPE_FAILED" | "AGENT_UPSTREAM_ERROR"
// Map
| "MAP_NO_RESULTS" | "MAP_SITEMAP_FAILED"
// Dependency
| "DEPENDENCY_UNAVAILABLE" | "DEPENDENCY_TIMEOUT"
// Playground / local engine
| "FEATURE_UNSUPPORTED_LOCALLY"
```

`MAP_SITEMAP_FAILED`, `EXTRACT_CONTENT_TRUNCATED`, `MAP_NO_RESULTS` are **non-fatal**: they appear
as `warning`/partial-status `code`s on `success:true` responses, not only on failures.

---

## 3. Envelope changes

```ts
export type ErrorResponse = {
  success: false;
  code: ErrorCodes; // NOW REQUIRED (was optional)
  error: string; // unchanged human message
  errorId: string; // NEW — uuidv7, in body (was logs-only)
  details?: ErrorDetails; // NEW typed union (was `any`)
  diagnostics?: Diagnostics; // NEW, default-on (public fork)
  sponsor_status?: string; // kept
  login_url?: string; // kept
};
```

`details` becomes a discriminated-ish typed object keyed by what the code needs. Each shape is
declared once as `ERROR_CATALOG[code].detailsShape` (§4), so server and UI agree (examples):

| code                          | `details` shape                                                         |
| ----------------------------- | ----------------------------------------------------------------------- |
| `INSUFFICIENT_CREDITS`        | `{ required: number, balance: number, shortfall: number }`              |
| `RATE_LIMIT_EXCEEDED`         | `{ limit: number, remaining: number, reset_at: string, scope: string }` |
| `QUEUE_FULL`                  | `{ queued: number, limit: number }`                                     |
| `URL_BLOCKED`                 | `{ reason: string, scope: "team"\|"global" }`                           |
| `COUNTRY_RESTRICTED`          | `{ country: string }`                                                   |
| `JOB_EXPIRED`                 | `{ expiredAt: string, ttlHours: number }`                               |
| `IDEMPOTENCY_CONFLICT`        | `{ originalJobId: string }`                                             |
| `EXTRACT_SCHEMA_MISMATCH`     | `{ field: string, expected: string }`                                   |
| `FEATURE_UNSUPPORTED_LOCALLY` | `{ feature: string, requiresEngine: "fire-engine" }`                    |
| `DEPENDENCY_*`                | `{ dependency: string, upstreamStatus?: number }`                       |

`diagnostics` (default-on, per RESPONSE-MODEL.md): `{ traceId?, durationMs?, steps?: [...] }` —
engine waterfall (scrape), per-source status (search), per-action results (interact).

**Success-side honesty (additive):** `warning?: string` already exists on `ScrapeResponse`
(`types.ts` ✓); extend the silent-success endpoints with partial-status fields carrying a `code`
(search per-source, map degraded counts, crawl `failureCount`/`failuresByCode`) per V2-ERROR-AUDIT
P2. No input changes.

---

## 4. Shared error catalog — single source of truth

All per-code knowledge (HTTP status, human explanation, suggested fix, `details` shape) lives in
**one dependency-free data module** that **both** the API runtime **and** the playground client
import. No second copy, no sync drift, no runtime endpoint.

```ts
// lib/error-catalog.ts (new) — MUST stay browser-safe:
//   pure data + types only; no node/server imports, so esbuild can bundle it
//   into the playground client (SPEC-PLAYGROUND-UI §2) unchanged.
import type { ErrorCodes } from "./error";

export interface ErrorCatalogEntry {
  httpStatus: number; // drives errorCodeToHttpStatus()
  explanation: string; // what happened, plain language
  fix: string; // what the caller should do next
  detailsShape?: string; // descriptor of `details` keys, e.g. "{required,balance,shortfall}"
  retriable?: boolean;
  category:
    | "auth"
    | "billing"
    | "rate"
    | "gating"
    | "lifecycle"
    | "scrape"
    | "extract"
    | "agent"
    | "map"
    | "dependency"
    | "local"
    | "unknown";
}

export const ERROR_CATALOG: Record<ErrorCodes, ErrorCatalogEntry> = {
  /* every code */
};

// Derived helpers — the ONLY consumers of the table:
export const errorCodeToHttpStatus = (code: ErrorCodes): number =>
  ERROR_CATALOG[code]?.httpStatus ?? 500;
export const explainError = (code: ErrorCodes) => ERROR_CATALOG[code];
```

- **API side:** the envelope builder + Express middleware (`index.ts:170-258`) call
  `errorCodeToHttpStatus` for the final status (the one intentional behavior change — Branch 7).
  `explanation`/`fix`/`detailsShape` may also be echoed into the response where useful.
- **Client side:** `<ErrorView>` imports `ERROR_CATALOG`/`explainError` from the **same module**
  (SPEC-PLAYGROUND-UI §6) — the page does not ship its own copy.
- **Guardrail:** because the type is `Record<ErrorCodes, …>`, adding a code to the union (§2)
  without a catalog entry is a **compile error** — the catalog can never fall behind the codes.

Status mapping the catalog encodes (fixes DNS-as-200 and client-caused-500, RESPONSE-MODEL change #2):

| Status | Codes (examples)                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `BAD_REQUEST`, `BAD_REQUEST_INVALID_JSON`                                                                                                            |
| 401    | `MISSING_API_KEY`, `INVALID_API_KEY`, `OAUTH_TOKEN_EXPIRED`                                                                                          |
| 402    | `INSUFFICIENT_CREDITS`, `UNVERIFIED_CREDIT_LIMIT`                                                                                                    |
| 403    | `TEAM_SUSPENDED`, `URL_BLOCKED`, `COUNTRY_RESTRICTED`, `KEY_NOT_KEYLESS_ELIGIBLE`                                                                    |
| 404    | `JOB_NOT_FOUND`, `JOB_EXPIRED`, `JOB_WRONG_TEAM`                                                                                                     |
| 408    | `SCRAPE_TIMEOUT`, `MAP_TIMEOUT`, `DEPENDENCY_TIMEOUT`                                                                                                |
| 409    | `IDEMPOTENCY_CONFLICT`, `JOB_CANCELLED`                                                                                                              |
| 422    | `SCRAPE_ACTIONS_NOT_SUPPORTED`, `SCRAPE_BRANDING_NOT_SUPPORTED`, `ZDR_NOT_SUPPORTED`, `FEATURE_UNSUPPORTED_LOCALLY`, `SCRAPE_UNSUPPORTED_FILE_ERROR` |
| 429    | `RATE_LIMIT_EXCEEDED`, `QUEUE_FULL`                                                                                                                  |
| 502    | `SCRAPE_ALL_ENGINES_FAILED`, `DEPENDENCY_UNAVAILABLE`, `AGENT_UPSTREAM_ERROR`                                                                        |
| 503    | `AUTH_BACKEND_UNAVAILABLE`, `BILLING_UNAVAILABLE`                                                                                                    |
| 500    | `UNKNOWN_ERROR` and any unmapped code (default)                                                                                                      |

---

## 5. `TransportableError` changes

`details` must survive serialization (it doesn't today) so the worker→API hop and the controller
both reach it:

```ts
class TransportableError extends Error {
  readonly code: ErrorCodes;
  readonly details?: ErrorDetails; // NEW
  serialize() {
    return { cause, stack, message, details: this.details };
  } // + details
  static deserialize(code, data) {
    /* restore details */
  }
}
```

- Subclasses that already hold structured data as prose (hostname, engines tried, page counts)
  lift it into `details` instead of only the message.
- **Worker boundary fix**: `scrape-worker.ts:767` (agent-reported) rewraps as plain `new Error()`,
  dropping `code`. Use the existing `serializeTransportableError`/`deserializeTransportableError`
  (`lib/error-serde.ts` ✓) across the hop.

---

## 6. Promote internal errors that should reach clients

Convert to `TransportableError` (or map at the boundary) so they carry a `code`:
`EngineError`→ contributes to `SCRAPE_ALL_ENGINES_FAILED` diagnostics; external-dependency
failures (browser svc, GCS, proxies, LLM) → `DEPENDENCY_UNAVAILABLE`/`DEPENDENCY_TIMEOUT`. Auth /
credit / rate-limit / blocklist / country / idempotency paths emit the new codes + `details`
instead of bare strings.

Leave purely-internal control-flow signals as plain `Error` (`WaterfallNextEngineSignal`,
`AddFeatureError`, `RemoveFeatureError`, `IndexMissError`, `EngineSnipedError`).

---

## 7. Backward-compat & rollout

- `code` becoming required and `errorId` being added are **additive** for clients (new/always-set
  fields). The only breaking-ish change is **HTTP status normalization** — call it out in release
  notes.
- `details` typing is internal; the wire stays JSON, existing readers ignore unknown keys.
- Sequence: (1) expand union + `errorHttpStatus` map; (2) `TransportableError.details` +
  serialize; (3) migrate middleware (auth/credit/rate/gating) onto codes; (4) scrape controller +
  worker boundary; (5) success-side honesty fields; (6) extract/agent/map/dependency codes.

## 8. Tests (snips)

Per repo convention (E2E "snips" preferred, `pnpm harness jest …`):

- Failure-path snips asserting `code`, `errorId` presence, and `errorCodeToHttpStatus` mapping per
  group (auth 401, credits 402, rate 429, job 404/expired, engines-failed 502, dependency 502/503,
  feature-unsupported 422).
- Happy-path snip asserting unchanged success bodies (no input/shape regressions) + new
  `warning`/partial-status where applicable.
- Gate fire-engine-dependent cases behind `!process.env.TEST_SUITE_SELF_HOSTED`; use `scrapeTimeout`
  from `./lib` for scrape timeouts.
- A unit test asserting `ERROR_CATALOG` has an entry for **every** `ErrorCodes` member (the
  `Record<ErrorCodes, …>` type already enforces this at compile time; the test guards against
  `// @ts-expect-error` slips and verifies `httpStatus` is a sane code).
