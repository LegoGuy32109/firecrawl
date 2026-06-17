# Spec — ErrorCodes / WarningCodes Refactor & Response Envelope

Implementation spec for **Phase 1** of [LOCAL-PLAYGROUND.md](./LOCAL-PLAYGROUND.md). Realizes the
[V2-ERROR-AUDIT.md](./V2-ERROR-AUDIT.md) fixes and the [RESPONSE-MODEL.md](./RESPONSE-MODEL.md)
envelope **on responses only**, and restructures error/warning codes into per-category enums.

**Hard constraints:**

- v2 **request/input** shapes are frozen. Only **response** bodies and HTTP status codes change.
- Code **string _values_** are preserved (e.g. `ScrapeError.TIMEOUT === "SCRAPE_TIMEOUT"`) so the
  serde wire format is byte-identical. But **magic strings are removed from code**: every
  comparison and map key migrates from the string literal to the **enum member**
  (`e.code === ScrapeError.TIMEOUT`). This is a goal of the refactor, and it **will not compile
  until every site is migrated** — that is intended (see §2, §10).

> Refs marked ✓ read directly.

---

## 1. Current state (verified)

- `ErrorCodes` is one **flat string-union** of 35 members (`lib/error.ts:1-35` ✓).
- Code values are load-bearing: serde is `` `${code}|${json}` `` with `errorMap` keyed by flat code
  (`lib/error-serde.ts:79-84` ✓); controllers compare `e.code === "SCRAPE_TIMEOUT"` — **17 such
  magic-string sites** (verified): `controllers/v2/scrape.ts` ×7, `v2/parse.ts` ×5, `v1/scrape.ts`
  ×5.
- `TransportableError.serialize()` returns only `{cause,stack,message}` — **`details` not
  transported** (`lib/error.ts:45-51` ✓). ~30 subclasses each have their own `serialize`/static
  `deserialize` reconstructing via their constructor.
- Envelope `ErrorResponse = { success:false, code?, error, details?:any, sponsor_status?,
login_url? }` — `code` optional, no `errorId`/`diagnostics` field (`controllers/v2/types.ts:1314` ✓).
- **`errorId` already exists as a log-correlation id, not a body field.** `const id = res.sentry ??
uuidv7()` (`index.ts:240` ✓; also `scrape.ts:407`, `parse.ts`, `v1/scrape.ts`). It's used to
  (a) tag the `logger.error` line and (b) feed `getErrorContactMessage(id)`, whose **self-hosted**
  text is _"Please check your logs for more details. Error ID: {id}"_ (`deployment.ts:6-13` ✓). So
  the uuid is not pointless — it correlates the response to a log line. `captureExceptionWithZdrCheck`
  (`services/sentry.ts:172` ✓) returns `Sentry.captureException`'s event id, but returns
  `undefined` for ZDR/ignored errors, and `captureException` returns an id even with no DSN — so
  **`res.sentry` is the only reliable "Sentry actually has this" signal.**
- **Warnings today are one concatenated `warning?: string`** — 16 producers space-join into it, so
  they're unparseable (verified):

  | Category       | Conditions (file)                                                                                                           |
  | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
  | scrape         | engine-partial-features (`scrapeURL/index.ts:1019`)                                                                         |
  | extract        | trimmed-chars (`llmExtract.ts:192`), trimmed-tokens (`:210`), token-count-failed (`:225`), cleaning-skipped (`:1159`)       |
  | query          | zdr (`query.ts:211`), no-markdown (`:218`), empty-markdown (`:227`), generation-failed (`:248`), highlights-failed (`:265`) |
  | changeTracking | zdr (`diff.ts:85`), compare-failed (`:101`), structured-diff-failed (`:272`)                                                |
  | media          | audio-unavailable (`audio.ts:54`), video-unavailable (`video.ts:210`)                                                       |
  | crawl          | few-results (`crawl-status.ts:364`)                                                                                         |

---

## 2. Per-category code enums (magic strings removed)

Codes are **defined per category as TS enums**; `ErrorCodes` is the union of them. Enum
**values keep the flat strings** (serde wire unchanged); enum **member names** drop the redundant
prefix. There is **no separate `ErrorCategory` enum** — the per-category enums _are_ the categories.

```ts
// lib/error-codes.ts (new) — enums (emit runtime objects; browser-safe, no server imports)
export enum AuthError {
  MISSING_API_KEY = "MISSING_API_KEY",
  INVALID_API_KEY = "INVALID_API_KEY",
  KEY_NOT_KEYLESS_ELIGIBLE = "KEY_NOT_KEYLESS_ELIGIBLE",
  TEAM_SUSPENDED = "TEAM_SUSPENDED",
  BACKEND_UNAVAILABLE = "AUTH_BACKEND_UNAVAILABLE",
  OAUTH_TOKEN_EXPIRED = "OAUTH_TOKEN_EXPIRED",
}
export enum BillingError {
  INSUFFICIENT_CREDITS = "INSUFFICIENT_CREDITS",
  UNVERIFIED_CREDIT_LIMIT = "UNVERIFIED_CREDIT_LIMIT",
  SPONSOR_VERIFICATION_EXPIRED = "SPONSOR_VERIFICATION_EXPIRED",
  UNAVAILABLE = "BILLING_UNAVAILABLE",
}
export enum RateError {
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  QUEUE_FULL = "QUEUE_FULL",
}
export enum GatingError {
  URL_BLOCKED = "URL_BLOCKED",
  COUNTRY_RESTRICTED = "COUNTRY_RESTRICTED",
  IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT",
}
export enum LifecycleError {
  JOB_NOT_FOUND = "JOB_NOT_FOUND",
  JOB_EXPIRED = "JOB_EXPIRED",
  JOB_WRONG_TEAM = "JOB_WRONG_TEAM",
  JOB_CANCELLED = "JOB_CANCELLED",
  ZDR_NOT_SUPPORTED = "ZDR_NOT_SUPPORTED",
}
export enum ScrapeError {
  // existing SCRAPE_* values preserved
  TIMEOUT = "SCRAPE_TIMEOUT",
  ALL_ENGINES_FAILED = "SCRAPE_ALL_ENGINES_FAILED",
  SSL = "SCRAPE_SSL_ERROR",
  SITE = "SCRAPE_SITE_ERROR",
  DNS = "SCRAPE_DNS_RESOLUTION_ERROR",
  ACTIONS_NOT_SUPPORTED = "SCRAPE_ACTIONS_NOT_SUPPORTED",
  BRANDING_NOT_SUPPORTED = "SCRAPE_BRANDING_NOT_SUPPORTED",
  UNSUPPORTED_FILE = "SCRAPE_UNSUPPORTED_FILE_ERROR" /* …all remaining SCRAPE_* values… */,
}
export enum ExtractError {
  NO_VALID_URLS = "EXTRACT_NO_VALID_URLS",
  SCHEMA_MISMATCH = "EXTRACT_SCHEMA_MISMATCH",
  LLM_REFUSAL = "EXTRACT_LLM_REFUSAL",
  SCRAPE_FAILED = "EXTRACT_SCRAPE_FAILED",
}
export enum AgentError {
  INDEX_ONLY = "AGENT_INDEX_ONLY",
  UPSTREAM = "AGENT_UPSTREAM_ERROR",
}
export enum MapError {
  TIMEOUT = "MAP_TIMEOUT",
  FAILED = "MAP_FAILED",
}
export enum DependencyError {
  UNAVAILABLE = "DEPENDENCY_UNAVAILABLE",
  TIMEOUT = "DEPENDENCY_TIMEOUT",
}
export enum LocalError {
  FEATURE_UNSUPPORTED = "FEATURE_UNSUPPORTED_LOCALLY",
}
export enum RequestError {
  BAD_REQUEST = "BAD_REQUEST",
  BAD_REQUEST_INVALID_JSON = "BAD_REQUEST_INVALID_JSON",
  PARSE_UNSUPPORTED_OPTIONS = "PARSE_UNSUPPORTED_OPTIONS",
}
export enum CommonError {
  UNKNOWN = "UNKNOWN_ERROR",
}

export type ErrorCodes =
  | AuthError
  | BillingError
  | RateError
  | GatingError
  | LifecycleError
  | ScrapeError
  | ExtractError
  | AgentError
  | MapError
  | DependencyError
  | LocalError
  | RequestError
  | CommonError;
```

Migrate the 35 existing codes by dropping each into the matching enum **keeping its value**.

**Consequences of using an enum union (intended):**

- The **17 `e.code === "STRING"` sites** become `e.code === ScrapeError.TIMEOUT` etc. — a string
  enum has no overlap with a raw string literal (TS2367), so the literals **must** go. This is the
  "remove magic strings" win; it is a compile error until done.
- `errorMap` (`error-serde.ts`) and both catalogs (§5) must use **computed enum keys**
  (`{ [ScrapeError.TIMEOUT]: … }`), not string-literal keys.
- Serde wire is unchanged: `` `${error.code}` `` still emits `"SCRAPE_TIMEOUT"`. On the way back,
  `deserialize` receives a raw `string` from the wire; index `errorMap` with a narrowing cast
  (`errorMap[code as ErrorCodes]`) since the enum values _are_ those strings.

---

## 3. Per-category warning enums (separate space)

Warnings are a **distinct type space** — never mixed into `ErrorCodes`. Fatal codes appear only on
error responses; warnings only on success/partial responses. All warning codes below are **new**
(there were none before — only message strings), introduced as warnings from the start.

```ts
export enum ScrapeWarning {
  ENGINE_PARTIAL_FEATURES = "SCRAPE_ENGINE_PARTIAL_FEATURES",
}
export enum ExtractWarning {
  CONTENT_TRIMMED_CHARS = "EXTRACT_CONTENT_TRIMMED_CHARS",
  CONTENT_TRIMMED_TOKENS = "EXTRACT_CONTENT_TRIMMED_TOKENS",
  TOKEN_COUNT_FAILED = "EXTRACT_TOKEN_COUNT_FAILED",
  CLEANING_SKIPPED_TOO_LONG = "EXTRACT_CLEANING_SKIPPED_TOO_LONG",
}
export enum QueryWarning {
  ZDR_UNSUPPORTED = "QUERY_ZDR_UNSUPPORTED",
  NO_MARKDOWN = "QUERY_NO_MARKDOWN",
  EMPTY_MARKDOWN = "QUERY_EMPTY_MARKDOWN",
  GENERATION_FAILED = "QUERY_GENERATION_FAILED",
  HIGHLIGHTS_FAILED = "QUERY_HIGHLIGHTS_FAILED",
}
export enum ChangeTrackingWarning {
  ZDR_UNSUPPORTED = "CHANGE_TRACKING_ZDR_UNSUPPORTED",
  COMPARE_FAILED = "CHANGE_TRACKING_COMPARE_FAILED",
  STRUCTURED_DIFF_FAILED = "CHANGE_TRACKING_STRUCTURED_DIFF_FAILED",
}
export enum MediaWarning {
  AUDIO_UNAVAILABLE = "MEDIA_AUDIO_UNAVAILABLE",
  VIDEO_UNAVAILABLE = "MEDIA_VIDEO_UNAVAILABLE",
}
export enum MapWarning {
  NO_RESULTS = "MAP_NO_RESULTS",
  SITEMAP_FAILED = "MAP_SITEMAP_FAILED",
}
export enum CrawlWarning {
  FEW_RESULTS = "CRAWL_FEW_RESULTS",
}

export type WarningCodes =
  | ScrapeWarning
  | ExtractWarning
  | QueryWarning
  | ChangeTrackingWarning
  | MediaWarning
  | MapWarning
  | CrawlWarning;
```

The 16 existing producers (§1) each push **one typed entry** (see §4) instead of string-concatenating.

---

## 4. Envelope changes

```ts
export type ErrorResponse = {
  success: false;
  code: ErrorCodes; // REQUIRED (was optional); FATAL space only
  error: string; // human message — carries real context (see "errorId" below)
  errorId?: string; // OPAQUE-PATH ONLY (see semantics)
  details?: ErrorDetails; // NEW typed (was `any`)
  diagnostics?: Diagnostics; // NEW, default-on (public fork)
  sponsor_status?: string;
  login_url?: string; // kept
};

export type WarningEntry = {
  code: WarningCodes;
  message: string;
  details?: WarningDetails;
};

// success / partial responses (per-endpoint, flexible — §4 "warnings"):
//   warning?: string;          // KEPT — existing assigned messages preserved verbatim; NOT derived
//   warnings?: WarningEntry[]; // NEW — structured, built inline by each endpoint
```

**`errorId` semantics (scoped to the opaque path).** Do **not** generate a uuid at every error
site. `errorId` is for errors the server **cannot explain inline** — `CommonError.UNKNOWN` /
uncaught 500s / Sentry-captured exceptions — where the diagnosis lives only in logs/Sentry:

- On that path, `errorId = res.sentry` when Sentry actually captured it; otherwise the existing
  logged `uuidv7` (so a self-hoster can grep their logs). It is always tied to a real log/Sentry
  entry — never fabricated for a response that already explains itself.
- **Typed errors carry no `errorId`.** Their `code` + `details` + `error` _are_ the context. We do
  not fall back to "check your logs" for these — that message is to be replaced with the real reason
  in the `error` string.
- `getErrorContactMessage` stays a **pure string formatter** — it is _not_ a logging wrapper.
  Logging stays explicit (`logger.error` / capture) at the catch site. Any "capture → get id →
  format" bundling for the opaque path is a small _separate_ helper used only there, and its message
  should carry as much safe context as possible (not just "check your logs").

**Warnings (flexible, inline, per-endpoint).** Warnings are an **envelope-level** concept, not a
scrape-`Document` mirror. Every v2 success/partial response type gets `warnings?: WarningEntry[]`,
and **each endpoint builds it inline** — there is **no shared collector class**:

- Scrape-pipeline warnings originate in worker-side transformers; they ride the job result as plain
  JSON (transport detail) and the controller lifts them into `warnings[]`.
- search / map / crawl / agent build `warnings[]` directly in their controller/aggregation — no
  `Document` involved.

`warning?: string` is kept and each existing producer keeps assigning its message verbatim
(backward compat); it is **not** derived from `warnings[]`. The two are parallel channels.

`details` is typed per code via two maps that **are** the contract (no separate descriptor). A code
**absent from its map carries no `details`**. See §4a.

> `Diagnostics` remains deferred to [RESPONSE-MODEL.md](./RESPONSE-MODEL.md). `ErrorDetails` /
> `WarningDetails` are defined in §4a.

---

## 4a. Details shapes — `ErrorDetails` & `WarningDetails` (exhaustive, extendable)

The maps live in `lib/error-details.ts` (type declarations only; it imports the enums solely as
type-level computed keys, so it's browser-safe and emits no runtime of its own). Only codes that
carry structured context appear — everything else carries no `details` (listed below).

```ts
// lib/error-details.ts
import {
  AuthError,
  BillingError,
  RateError,
  GatingError,
  LifecycleError,
  ScrapeError,
  ExtractError,
  AgentError,
  MapError,
  DependencyError,
  LocalError,
  ScrapeWarning,
  ExtractWarning,
  QueryWarning,
  MediaWarning,
  MapWarning,
  CrawlWarning,
  type ErrorCodes,
  type WarningCodes,
} from "./error-codes";

export interface ErrorDetailsMap {
  // auth
  [AuthError.INVALID_API_KEY]: {
    reason: "malformed" | "not_found" | "revoked";
  };
  [AuthError.BACKEND_UNAVAILABLE]: { retriedTimes: number };
  [AuthError.OAUTH_TOKEN_EXPIRED]: { expiredAt: string };
  // billing
  [BillingError.INSUFFICIENT_CREDITS]: {
    required: number;
    balance: number;
    shortfall: number;
  };
  [BillingError.UNVERIFIED_CREDIT_LIMIT]: { limit: number; usage: number };
  [BillingError.SPONSOR_VERIFICATION_EXPIRED]: { deadline: string };
  [BillingError.UNAVAILABLE]: { failedOpen: boolean }; // was the billing gate bypassed?
  // rate / queue
  [RateError.RATE_LIMIT_EXCEEDED]: {
    limit: number;
    remaining: number;
    reset_at: string;
    scope: string;
  };
  [RateError.QUEUE_FULL]: { queued: number; limit: number };
  // gating
  [GatingError.URL_BLOCKED]: { reason: string; scope: "team" | "global" };
  [GatingError.COUNTRY_RESTRICTED]: { country: string };
  [GatingError.IDEMPOTENCY_CONFLICT]: { originalJobId: string };
  // lifecycle
  [LifecycleError.JOB_EXPIRED]: { expiredAt: string; ttlHours: number };
  [LifecycleError.ZDR_NOT_SUPPORTED]: { feature: string };
  // scrape (structured where it helps; all other ScrapeError.* carry none)
  [ScrapeError.TIMEOUT]: { timeoutMs: number; phase?: string };
  [ScrapeError.ALL_ENGINES_FAILED]: {
    enginesTried: string[];
    lastError?: string;
  };
  [ScrapeError.SSL]: { hostname: string };
  [ScrapeError.SITE]: { hostname?: string; statusCode?: number };
  [ScrapeError.DNS]: { hostname: string };
  [ScrapeError.UNSUPPORTED_FILE]: { contentType?: string; url?: string };
  [ScrapeError.ACTIONS_NOT_SUPPORTED]: { engine?: string };
  [ScrapeError.BRANDING_NOT_SUPPORTED]: {
    reason: "pdf" | "document" | "no_cdp_engine";
  };
  // extract / agent / map / dependency / local
  [ExtractError.SCHEMA_MISMATCH]: { field: string; expected: string };
  [ExtractError.SCRAPE_FAILED]: { url: string; cause?: ErrorCodes };
  [AgentError.UPSTREAM]: { status: number; body?: string };
  [MapError.FAILED]: { source?: "index" | "sitemap" | "search" };
  [DependencyError.UNAVAILABLE]: {
    dependency: string;
    upstreamStatus?: number;
  };
  [DependencyError.TIMEOUT]: { dependency: string; timeoutMs?: number };
  [LocalError.FEATURE_UNSUPPORTED]: {
    feature: string;
    requiresEngine: "fire-engine";
  };
}

export interface WarningDetailsMap {
  [ScrapeWarning.ENGINE_PARTIAL_FEATURES]: {
    unsupportedFeatures: string[];
    engine?: string;
  };
  [ExtractWarning.CONTENT_TRIMMED_CHARS]: { maxChars: number };
  [ExtractWarning.CONTENT_TRIMMED_TOKENS]: {
    numTokens: number;
    maxTokens: number;
    preTrimmed?: boolean;
  };
  [ExtractWarning.TOKEN_COUNT_FAILED]: { maxTokens: number };
  [ExtractWarning.CLEANING_SKIPPED_TOO_LONG]: {
    numTokens: number;
    maxOutputTokens: number;
  };
  [QueryWarning.GENERATION_FAILED]: { models: string[] };
  [QueryWarning.HIGHLIGHTS_FAILED]: { models: string[] };
  [MediaWarning.AUDIO_UNAVAILABLE]: { reason: "not_configured" };
  [MediaWarning.VIDEO_UNAVAILABLE]: { reason: "not_configured" };
  [MapWarning.SITEMAP_FAILED]: { sitemapUrl?: string };
  [CrawlWarning.FEW_RESULTS]: { resultCount: number; baseDomain?: string };
}

// Precise per-code type for constructors; loose union for the envelope field.
export type ErrorDetailsFor<C extends ErrorCodes> =
  C extends keyof ErrorDetailsMap ? ErrorDetailsMap[C] : undefined;
export type WarningDetailsFor<C extends WarningCodes> =
  C extends keyof WarningDetailsMap ? WarningDetailsMap[C] : undefined;
export type ErrorDetails = ErrorDetailsMap[keyof ErrorDetailsMap];
export type WarningDetails = WarningDetailsMap[keyof WarningDetailsMap];
```

**Codes that carry no `details` (exhaustive, intentional):** `AuthError.{MISSING_API_KEY,
KEY_NOT_KEYLESS_ELIGIBLE, TEAM_SUSPENDED}`; `LifecycleError.{JOB_NOT_FOUND, JOB_WRONG_TEAM,
JOB_CANCELLED}`; all `RequestError.*`; `CommonError.UNKNOWN`; `ExtractError.{NO_VALID_URLS,
LLM_REFUSAL}`; `AgentError.INDEX_ONLY`; `MapError.TIMEOUT`; every existing `ScrapeError.*` not in
the map above; and warnings `QueryWarning.{ZDR_UNSUPPORTED, NO_MARKDOWN, EMPTY_MARKDOWN}`,
`ChangeTrackingWarning.*`, `MapWarning.NO_RESULTS`. For these the `code` + `error` (and the human
message) convey everything; a structured `details` would add nothing.

**Extending mid-implementation (sanctioned).** If an agent finds a case needs more context:

1. add the field as **optional** to an existing shape (backward-compatible), or
2. add a **new line** to `ErrorDetailsMap` / `WarningDetailsMap` for a code that had none, or
3. for a brand-new condition, add the enum member (§2/§3) + its catalog entry (§5, compile-forced)
   - (if structured) its details line here.

Keep shapes **flat and JSON-serializable**; **no index signatures** (`[key: string]: unknown`) —
extend explicitly so the type stays a real contract. Constructors/producers should type their
payload as `ErrorDetailsFor<C>` / `WarningDetailsFor<C>` so the shape is checked at the call site;
the envelope field stays the loose `ErrorDetails` / `WarningDetails` union.

---

## 5. Two shared catalogs — single source of truth

Both catalogs live in **one dependency-free module** imported by the API runtime **and** the
playground client (SPEC-PLAYGROUND-UI §2). Separate catalogs mirror the separate code spaces;
warnings have no `httpStatus`. Use **computed enum keys** (§2).

```ts
// lib/error-catalog.ts (new) — browser-safe: pure data only, no node/server imports
import {
  ErrorCodes,
  WarningCodes /* + the enums for computed keys */,
} from "./error-codes";

export interface ErrorEntry {
  httpStatus: number;
  explanation: string;
  fix: string;
  retriable?: boolean;
}
export interface WarningEntry {
  explanation: string;
  fix: string;
}

export const ERROR_CATALOG: Record<ErrorCodes, ErrorEntry> = {
  /* [ScrapeError.TIMEOUT]: … */
};
export const WARNING_CATALOG: Record<WarningCodes, WarningEntry> = {
  /* [MapWarning.NO_RESULTS]: … */
};

export const errorCodeToHttpStatus = (c: ErrorCodes): number =>
  ERROR_CATALOG[c]?.httpStatus ?? 500;
export const explainError = (c: ErrorCodes) => ERROR_CATALOG[c];
export const explainWarning = (c: WarningCodes) => WARNING_CATALOG[c];
```

- **API:** the status-normalization sites (§6) use `errorCodeToHttpStatus` for the final status.
- **Client:** `<ErrorView>` / `<WarningList>` import the catalogs from this same module — no copy.
- **Guardrail:** `Record<ErrorCodes, …>` / `Record<WarningCodes, …>` make a missing entry a
  **compile error** — neither catalog can fall behind its enums.

Status mapping `ERROR_CATALOG` encodes (fixes DNS-as-200, client-caused-500 — RESPONSE-MODEL #2):

| Status | Codes (examples)                                                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `RequestError.BAD_REQUEST`, `BAD_REQUEST_INVALID_JSON`                                                                                                  |
| 401    | `AuthError.MISSING_API_KEY`, `INVALID_API_KEY`, `OAUTH_TOKEN_EXPIRED`                                                                                   |
| 402    | `BillingError.INSUFFICIENT_CREDITS`, `UNVERIFIED_CREDIT_LIMIT`                                                                                          |
| 403    | `AuthError.TEAM_SUSPENDED`, `GatingError.URL_BLOCKED`, `COUNTRY_RESTRICTED`, `AuthError.KEY_NOT_KEYLESS_ELIGIBLE`                                       |
| 404    | `LifecycleError.JOB_NOT_FOUND`, `JOB_EXPIRED`, `JOB_WRONG_TEAM`                                                                                         |
| 408    | `ScrapeError.TIMEOUT`, `MapError.TIMEOUT`, `DependencyError.TIMEOUT`                                                                                    |
| 409    | `GatingError.IDEMPOTENCY_CONFLICT`, `LifecycleError.JOB_CANCELLED`                                                                                      |
| 422    | `ScrapeError.ACTIONS_NOT_SUPPORTED`, `BRANDING_NOT_SUPPORTED`, `UNSUPPORTED_FILE`, `LifecycleError.ZDR_NOT_SUPPORTED`, `LocalError.FEATURE_UNSUPPORTED` |
| 429    | `RateError.RATE_LIMIT_EXCEEDED`, `QUEUE_FULL`                                                                                                           |
| 502    | `ScrapeError.ALL_ENGINES_FAILED`, `DependencyError.UNAVAILABLE`, `AgentError.UPSTREAM`                                                                  |
| 503    | `AuthError.BACKEND_UNAVAILABLE`, `BillingError.UNAVAILABLE`                                                                                             |
| 500    | `CommonError.UNKNOWN` and any unmapped code (default)                                                                                                   |

---

## 6. Scope of the migration (accurate surface)

This is broad on purpose; making `code` required forces every error path to declare itself.

- **Magic-string comparisons:** 17 sites → enum members (§2): `scrape.ts` ×7, `parse.ts` ×5,
  `v1/scrape.ts` ×5.
- **`code` becomes required:** every place that constructs an `ErrorResponse` must supply a `code`
  or it won't compile. That includes the **~191 `res.status(<n>).json(...)` sites across v2
  controllers** (a mix of successes and errors) — many of which today return a **bare string with no
  code** (e.g. `monitor.ts` returns `{ success:false, error:"Monitor not found" }` ×6). The bulk of
  the work is **assigning a code** to these ad-hoc returns, not the typing.
- **Status normalization:** route those error returns + the **3 `TransportableError` status ladders**
  (`scrape.ts:397`, `parse.ts:606`, `v1:259`) + the **~6 shared-middleware gates**
  (auth/credits/rate/blocklist/country/idempotency) through `errorCodeToHttpStatus`.
- **`details` transport:** add `details` to `TransportableError.serialize()`/`deserialize()` and
  thread it through the **~30 subclasses** (each has its own `serialize`/static `deserialize` and a
  constructor that doesn't currently accept `details`) — or centralize reconstruction so subclasses
  don't each need editing.
- **Warnings:** add `warnings?: WarningEntry[]` to each v2 response type; convert the 16 producers
  to also push a typed entry (keeping their `warning` string assignment); build `warnings[]` inline
  per endpoint.

The build will be red until these are addressed; that is the intended forcing function.

---

## 7. `TransportableError` & promoting internal errors

Fatal path (mechanism unchanged, `details` now transported — see §6 for the subclass scope):

```ts
class TransportableError extends Error {
  readonly code: ErrorCodes;
  readonly details?: ErrorDetails; // NEW
  serialize() {
    return { cause, stack, message, details: this.details };
  }
}
```

- Lift structured data (hostname, engines tried, counts) into `details`.
- **Worker boundary fix**: `scrape-worker.ts:767` (agent-reported) rewraps as plain `new Error()`,
  dropping `code`. Use `serializeTransportableError`/`deserializeTransportableError`
  (`lib/error-serde.ts` ✓) across the hop.

Promote internal errors that should reach clients so they carry a `code`: `EngineError` → feeds
`ScrapeError.ALL_ENGINES_FAILED` diagnostics; dependency failures (browser svc, GCS, proxies, LLM)
→ `DependencyError.*`; auth/credit/rate/gating paths emit the new codes + `details` instead of bare
strings. Leave internal control-flow signals plain (`WaterfallNextEngineSignal`, `AddFeatureError`,
`RemoveFeatureError`, `IndexMissError`, `EngineSnipedError`).

---

## 8. Warnings: no transportable type needed

Warnings are **not** `TransportableError` and need no equivalent. `TransportableError` exists only
because a thrown exception loses its `code`/class across the worker→API boundary. Warnings are never
thrown — they're plain `WarningEntry` data that rides the normal JSON result (the existing
`document.warning` string already proves the result crosses the boundary), or are built directly in
the controller. So they transport for free.

---

## 9. Rollout

1. `lib/error-codes.ts` (per-category error + warning enums; `ErrorCodes`/`WarningCodes` unions),
   keeping all existing values, and `lib/error-details.ts` (the `ErrorDetailsMap`/`WarningDetailsMap`
   - `ErrorDetails`/`WarningDetails`/`*For<C>` types — §4a). Update `lib/error.ts` /
     `error-serde.ts` imports + computed keys.
2. Migrate the 17 magic-string comparisons to enum members.
3. `lib/error-catalog.ts` (both catalogs + helpers).
4. `TransportableError.details` + serialize/deserialize across subclasses; worker-boundary fix.
5. Make `code` required; assign codes to every ad-hoc error return; route status through
   `errorCodeToHttpStatus` (controllers + ladders + middleware).
6. `errorId` on the opaque path only (Sentry id, else logged uuid); improve the opaque message.
7. Add `warnings?: WarningEntry[]` per v2 response; convert the 16 producers to push typed entries
   inline (keep `warning` string).

Backward-compat: new fields are additive; `warning` string preserved; the deliberate behavior
changes are **HTTP status normalization** and **`error` message wording** (real context instead of
"check your logs") — call both out in release notes.

## 10. Tests (snips + unit)

- **Two completeness unit tests**: `ERROR_CATALOG` covers every `ErrorCodes` member and
  `WARNING_CATALOG` every `WarningCodes` member (the `Record<…>` types enforce at compile time;
  tests guard `@ts-expect-error` slips and assert sane `httpStatus`).
- Failure-path snips: assert `code` (as the enum value) and `errorCodeToHttpStatus` per group
  (auth 401, billing 402, rate 429, lifecycle 404, engines 502, dependency 502/503, local 422).
  Assert typed errors carry **no `errorId`**, and the opaque `UNKNOWN_ERROR` path carries one only
  when Sentry is configured.
- Warning snips: assert structured `warnings[]` entries **and** that the `warning` string still
  contains the original legacy text verbatim (preserved, not derived) — e.g. media-unavailable,
  extract-trimmed, crawl few-results.
- Gate fire-engine cases behind `!process.env.TEST_SUITE_SELF_HOSTED`; AI cases behind
  `!process.env.TEST_SUITE_SELF_HOSTED || OPENAI_API_KEY || OLLAMA_BASE_URL`; use `scrapeTimeout`
  from `./lib`.
