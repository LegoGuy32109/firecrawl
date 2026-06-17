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
export enum CrawlError {
  DENIAL = "CRAWL_DENIAL",
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
export enum BrowserError {
  SESSION_NOT_FOUND = "BROWSER_SESSION_NOT_FOUND",
  SESSION_EXPIRED = "BROWSER_SESSION_EXPIRED",
  SESSION_FORBIDDEN = "BROWSER_SESSION_FORBIDDEN",
  SESSION_LIMIT_EXCEEDED = "BROWSER_SESSION_LIMIT_EXCEEDED",
  EXECUTION_FAILED = "BROWSER_EXECUTION_FAILED",
  SERVICE_UNAVAILABLE = "BROWSER_SERVICE_UNAVAILABLE",
}
export enum MonitorError {
  MONITOR_NOT_FOUND = "MONITOR_NOT_FOUND",
  CHECK_NOT_FOUND = "MONITOR_CHECK_NOT_FOUND",
  EMAIL_TOKEN_INVALID = "MONITOR_EMAIL_TOKEN_INVALID",
  EMAIL_TOKEN_EXPIRED = "MONITOR_EMAIL_TOKEN_EXPIRED",
  CONFLICT = "MONITOR_CONFLICT",
}
export enum ProxyError {
  UPSTREAM_UNAVAILABLE = "PROXY_UPSTREAM_UNAVAILABLE",
  UPSTREAM_TIMEOUT = "PROXY_UPSTREAM_TIMEOUT",
  UPSTREAM_BAD_RESPONSE = "PROXY_UPSTREAM_BAD_RESPONSE",
  NOT_CONFIGURED = "PROXY_NOT_CONFIGURED",
}
export enum FeedbackError {
  TARGET_NOT_FOUND = "FEEDBACK_TARGET_NOT_FOUND",
  WINDOW_EXPIRED = "FEEDBACK_WINDOW_EXPIRED",
  TEAM_OPTED_OUT = "FEEDBACK_TEAM_OPTED_OUT",
  DB_UNAVAILABLE = "FEEDBACK_DB_UNAVAILABLE",
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
  | CrawlError
  | ScrapeError
  | ExtractError
  | AgentError
  | MapError
  | DependencyError
  | BrowserError
  | MonitorError
  | ProxyError
  | FeedbackError
  | LocalError
  | RequestError
  | CommonError;
```

Migrate the 35 existing codes by dropping each into the matching enum **keeping its value**. Add
new categories rather than overloading broad lifecycle/dependency codes when the user-facing
surface is distinct. Browser sessions, monitors/checks, local proxy failures, and feedback
submission each get their own category because specificity is the point of the model: users and
the playground should be able to tell where in the system the failure occurred.

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
// Envelope-level warning OCCURRENCE (one per event). Named `Warning` (NOT `WarningEntry`) to keep
// it distinct from the catalog's per-code metadata type `WarningCatalogEntry` (§5) — the playground
// client imports both from these modules and the old shared name `WarningEntry` collided.
export type Warning = {
  code: WarningCodes;
  message: string;
  details?: WarningDetails;
};

export type ResponseStatus =
  | "ok" // successful terminal state, no structured warnings
  | "warning" // successful terminal state with warnings/degradation
  | "processing" // async job still running
  | "failed"; // request failed or async job failed

export type JobState = "processing" | "completed" | "cancelled" | "failed";

export type Diagnostics = {
  privacy: {
    // Effective privacy/ZDR behavior for this specific request/job/endpoint.
    zeroDataRetention: boolean;
    // "not_applicable" means no customer scrape/search content is processed by this endpoint,
    // but the response still followed the safe non-content path for a forced-ZDR user.
    mode: "disabled" | "allowed" | "forced" | "request" | "not_applicable";
    // DERIVED from `mode`, never set independently (see "stripping" below): true iff
    // mode is "forced" | "request". The enveloper computes it; callers cannot disagree.
    reduced: boolean;
  };
  traceId?: string;
  durationMs?: number;
  steps?: DiagnosticStep[];
  sources?: Record<string, DiagnosticStep>;
  actions?: DiagnosticStep[];
};

export type DiagnosticStatus =
  | "ok"
  | "warning"
  | "failed"
  | "skipped"
  | "timed_out";

// A step has an ALWAYS-SAFE core plus a GATED sensitive bucket. The enveloper's addStep() is the
// only writer; when privacy.reduced is true it drops `sensitive` (and any non-templated `message`)
// structurally — default-deny, not denylist-scrub. There is NO free-form `details: Record<string,
// unknown>` anymore (that was the leak/contract hole — §"stripping").
export type DiagnosticStep = {
  name: DiagnosticStepName; // controlled vocabulary, not free text
  status: DiagnosticStatus;
  code?: ErrorCodes | WarningCodes; // public codes only
  durationMs?: number;
  startedAt?: string;
  endedAt?: string;
  // Gated: emitted ONLY when privacy.reduced === false. Typed per step-kind, no index signature.
  sensitive?: DiagnosticStepSensitive;
};

export type ResponseCore = {
  success: boolean;
  status: ResponseStatus;
  diagnostics: Diagnostics; // REQUIRED on every client-facing v2 JSON response
  warning?: string; // KEPT — existing assigned messages preserved verbatim; NOT derived
  warnings?: Warning[]; // NEW — structured, built inline by each endpoint
};

export type ErrorCore = ResponseCore & {
  success: false;
  status: "failed";
  code: ErrorCodes; // REQUIRED; fatal/dominant error space only
  error: string; // human message — carries real context (see "errorId" below)
  errorId?: string; // OPAQUE-PATH ONLY (see semantics)
  details?: ErrorDetails; // typed by ErrorDetailsMap[code] when present
};

export type ErrorResponse = ErrorCore & {
  sponsor_status?: string;
  login_url?: string; // kept for request-level auth/billing remediation
};

export type AsyncJobFailureResponse<TData = unknown> = ErrorCore & {
  jobState: "failed";
  failureCount?: number;
  failuresByCode?: Partial<Record<ErrorCodes, number>>;
  data?: TData;
  creditsUsed?: number;
  expiresAt?: string;
  createdAt?: string;
  completedAt?: string;
  duration?: number;
};
```

`status` is the universal envelope state. A response with warnings is `status: "warning"` even for
async jobs that otherwise completed/cancelled, so clients know to inspect `warning`/`warnings[]`.
Async endpoints that need lifecycle state add `jobState`; they do not encode lifecycle in
`status`. Examples:

- sync success: `{ success:true, status:"ok", diagnostics, ... }`
- sync success with warnings: `{ success:true, status:"warning", warnings, diagnostics, ... }`
- async running: `{ success:true, status:"processing", jobState:"processing", diagnostics, ... }`
- async completed without warnings: `{ success:true, status:"ok", jobState:"completed", diagnostics, ... }`
- async cancelled without warnings: `{ success:true, status:"ok", jobState:"cancelled", diagnostics, ... }`
- async completed/cancelled with warnings: `{ success:true, status:"warning", jobState:"completed"|"cancelled", warnings, diagnostics, ... }`
- request or async failure: `{ success:false, status:"failed", code, error, diagnostics, ... }`

`ErrorResponse` is for request-level failures. `AsyncJobFailureResponse` is for a successful status
lookup that reports the referenced job failed. Both share `ErrorCore`, so the playground renders
`code`/`details`/`diagnostics` consistently, but job metadata (`jobState`, `failureCount`,
`failuresByCode`, `data`, timings) stays out of request-failure responses.

`AsyncJobFailureResponse.code` is required and represents the dominant/root cause. Use
`failuresByCode` for mixed crawl/batch failures. Use `CommonError.UNKNOWN` only when the dominant
cause genuinely cannot be classified.

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
- `errorId` lives on `ErrorCore`, so async job failures can carry it if an opaque worker/status
  branch genuinely has a Sentry/log-correlated id. Normal typed/domain async failures do not set it.

**Warnings (flexible, inline, per-endpoint).** Warnings are an **envelope-level** concept, not a
scrape-`Document` mirror. Every v2 success/partial response type gets `warnings?: Warning[]`,
and **each endpoint builds it inline** — there is **no shared collector class**:

- Scrape-pipeline warnings originate in worker-side transformers; they ride the job result as plain
  JSON (transport detail) and the controller lifts them into `warnings[]`.
- search / map / crawl / agent build `warnings[]` directly in their controller/aggregation — no
  `Document` involved.

`warning?: string` is kept and each existing producer keeps assigning its message verbatim
(backward compat); it is **not** derived from `warnings[]`. The two are parallel channels.

**Anti-drift: write the text once.** The two channels drift only if a producer types the message
twice. They don't need a collector class to stay in sync — they need a single text literal used for
both. A tiny **pure** helper (browser-safe, no shared state) constructs the structured entry; the
legacy string reuses `entry.message`:

```ts
// lib/error-catalog.ts (or alongside the warning enums) — pure, no class, no collector
export function makeWarning<C extends WarningCodes>(
  code: C,
  message: string,
  details?: WarningDetailsFor<C>,
): Warning {
  return { code, message, ...(details ? { details } : {}) };
}

// at a producer — the message text exists exactly ONCE:
const w = makeWarning(
  MediaWarning.AUDIO_UNAVAILABLE,
  "Audio is not configured on this deployment.",
  {
    reason: "not_configured",
  },
);
warnings.push(w);
document.warning = [document.warning, w.message].filter(Boolean).join(" "); // legacy channel, same text
```

Each endpoint still decides its own message and how it collects (`push`, or lifting from the worker
result). There is just no second source of truth for the text — so the §10 "warning string contains
the verbatim text" assertion holds by construction, with no collector and no derivation.

Warnings are stable summary events. Diagnostics are the execution trace where warning events can
also appear. A warning entry should generally correspond to a `diagnostics.steps[]` entry with
`status:"warning"` and the same warning `code` when the producer can identify the step.

`details` is typed per code via two maps that **are** the contract (no separate descriptor). A code
**absent from its map carries no `details`**. See §4a.

**Diagnostics contract.** `diagnostics` is public, redacted execution trace metadata, not a dumping
ground. It answers "what major steps happened?" while `details` answers "what structured data
belongs to this code?"

Diagnostics may include:

- step/source/action names, statuses, public error/warning codes, human messages
- timings, counts, retry/fallback/skipped reasons
- engine/source/action labels
- sanitized hostnames or URLs only when already safe for that response

Diagnostics must not include:

- API keys, auth headers, cookies, secrets, tokens, signed URLs
- raw HTML/markdown/content, screenshots/base64/file contents, LLM prompts/completions
- full upstream response bodies, unallowlisted headers, raw customer request bodies
- selectors/actions/options when ZDR/privacy rules would prohibit retaining or exposing them

**ZDR/privacy semantics.** `diagnostics.privacy` is required so ZDR users can see whether the
specific request/job/endpoint followed the privacy-safe path.

- Scrape-like endpoints resolve effective ZDR from `getScrapeZDR(req.acuc?.flags) === "forced"`,
  request `zeroDataRetention`, and lockdown. Search resolves it through `getSearchZDR` /
  `getSearchForcedKind`.
- The resolved value flows through request logging, job data, worker Sentry scope, scraper
  `internalOptions`, downstream services, and async status lookup.
- Existing behavior redacts request target hints, scrape URLs/options/cost metadata, tracking rows,
  Sentry events, downstream request IDs, and some features under ZDR. Diagnostics must mirror that
  behavior.
- Under ZDR, diagnostics are still present but reduced: step names, statuses, public codes, counts,
  durations, dependency categories, and feature names are allowed; URL path/query, content, request
  bodies/options, user selectors/actions, prompts/completions, response bodies, and cross-system
  trace ids are not.

**The stripping mechanism (how reduction is enforced, not just flagged).** Setting
`privacy.reduced` removes nothing by itself — it is a derived fact, and the sensitive data lives in
the steps. Enforcement is structural, at a single chokepoint:

- **`mode` is caller-supplied** (only the request knows its resolved ZDR posture). **`reduced` is
  derived** by the enveloper: `reduced = mode === "forced" || mode === "request"`. Callers cannot
  set `reduced`, so it can never disagree with `mode`.
- **The enveloper's `addStep()` is the only writer of `diagnostics.steps` / `sources` / `actions`.**
  Controllers never push steps directly. A step is split into an **always-safe core**
  (`name` from a controlled `DiagnosticStepName` vocabulary, `status`, public `code`, `durationMs`,
  timestamps) and a **gated `sensitive` bucket** (hostnames, URLs, selectors, value-bearing counts).
- When `reduced` is true, `addStep()` **omits `sensitive`** (and any free-text `message` not drawn
  from a safe template) **by construction** — default-deny. This is an allowlist _projection_, not a
  denylist _scrub_: you start from the safe core and never copy the gated bucket through, so a new
  sensitive field added later is safe-by-default (it lives in `sensitive`, which is dropped) rather
  than a silent leak waiting on someone to remember to scrub it.
- Because the only path to a step is `addStep()`, a controller **cannot** attach content to a
  reduced response even by mistake — there is no code path that carries the gated bucket out under
  ZDR. The flag is the signal; the projection at the chokepoint is the protection.
- `diagnostics.privacy.mode = "not_applicable"` is used for endpoints that do not process or retain
  customer scrape/search content but still need to reassure forced-ZDR users that the path is
  privacy-safe. It must not be used to bypass redaction on endpoints that do process content.

**Response helper.** All v2 controllers should use a v2-local helper module
`controllers/v2/response-enveloper.ts` to construct responses. This avoids hand-rolled `status` and
`diagnostics.privacy` drift across ~190 response sites and keeps the contract scoped to v2 rather
than becoming an accidental global/v3 API.

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
  BrowserError,
  MonitorError,
  ProxyError,
  FeedbackError,
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
  // browser / monitor / proxy / feedback
  [BrowserError.SESSION_EXPIRED]: { expiredAt: string };
  [BrowserError.SESSION_LIMIT_EXCEEDED]: { active: number; limit: number };
  [BrowserError.EXECUTION_FAILED]: {
    exitCode?: number;
    killed?: boolean;
    timedOut?: boolean;
  };
  [BrowserError.SERVICE_UNAVAILABLE]: { dependency: "browser-service" };
  [MonitorError.EMAIL_TOKEN_EXPIRED]: { expiredAt: string };
  [MonitorError.CONFLICT]: { reason: string };
  [ProxyError.UPSTREAM_UNAVAILABLE]: { upstream: "support" | "research" };
  [ProxyError.UPSTREAM_TIMEOUT]: {
    upstream: "support" | "research";
    timeoutMs: number;
  };
  [ProxyError.UPSTREAM_BAD_RESPONSE]: {
    upstream: "support" | "research";
    upstreamStatus?: number;
  };
  [FeedbackError.WINDOW_EXPIRED]: { expiredAt?: string };
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
`ChangeTrackingWarning.*`, `MapWarning.NO_RESULTS`; `BrowserError.{SESSION_NOT_FOUND,
SESSION_FORBIDDEN}`; `MonitorError.{MONITOR_NOT_FOUND, CHECK_NOT_FOUND, EMAIL_TOKEN_INVALID}`;
`ProxyError.NOT_CONFIGURED`; `FeedbackError.{TARGET_NOT_FOUND, TEAM_OPTED_OUT, DB_UNAVAILABLE}`.
For these the `code` + `error` (and the human message) convey everything; a structured `details`
would add nothing.

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

// Per-code catalog METADATA (one per code). Named `…CatalogEntry`, distinct from the envelope
// OCCURRENCE type `Warning` (§4) — the old name `WarningEntry` collided across the two modules the
// client imports together.
export interface ErrorCatalogEntry {
  httpStatus: number;
  explanation: string;
  fix: string;
  retriable?: boolean;
}
export interface WarningCatalogEntry {
  explanation: string;
  fix: string;
}

export const ERROR_CATALOG: Record<ErrorCodes, ErrorCatalogEntry> = {
  /* [ScrapeError.TIMEOUT]: … */
};
export const WARNING_CATALOG: Record<WarningCodes, WarningCatalogEntry> = {
  /* [MapWarning.NO_RESULTS]: … */
};

export const errorCodeToHttpStatus = (c: ErrorCodes): number =>
  ERROR_CATALOG[c]?.httpStatus ?? 500;
export const explainError = (c: ErrorCodes) => ERROR_CATALOG[c];
export const explainWarning = (c: WarningCodes) => WARNING_CATALOG[c];

// Wire-boundary validators — replace the unsound `code as ErrorCodes` cast in error-serde (§2).
// The Record<…> types already make these key sets exhaustive, so deriving from the catalog needs
// NO separate maintenance and cannot drift from the enums.
const ERROR_CODE_SET: ReadonlySet<string> = new Set(Object.keys(ERROR_CATALOG));
const WARNING_CODE_SET: ReadonlySet<string> = new Set(
  Object.keys(WARNING_CATALOG),
);
export const parseErrorCode = (s: string): ErrorCodes | undefined =>
  ERROR_CODE_SET.has(s) ? (s as ErrorCodes) : undefined;
export const parseWarningCode = (s: string): WarningCodes | undefined =>
  WARNING_CODE_SET.has(s) ? (s as WarningCodes) : undefined;
```

- **API:** the status-normalization sites (§6) use `errorCodeToHttpStatus` for the final status.
- **Deserialize boundary (§2):** `error-serde.ts` indexes with `parseErrorCode(code)` instead of
  `code as ErrorCodes`; a bad/old wire value degrades to `CommonError.UNKNOWN` rather than
  masquerading as a valid code. (This makes `error-serde.ts` import the catalog, not just
  `error-codes.ts` — fine, both are browser-safe leaves.)
- **Client:** `<ErrorView>` / `<WarningList>` import the catalogs from this same module — no copy.
- **Guardrail (completeness):** `Record<ErrorCodes, …>` / `Record<WarningCodes, …>` make a missing
  entry a **compile error** — neither catalog can fall behind its enums.
- **Guardrail (browser-safety, CI):** `error-codes.ts` / `error-details.ts` / `error-catalog.ts`
  MUST stay node/server-free or the playground bundle breaks silently. Enforce with a test that runs
  **esbuild `platform:"browser", bundle:true`** on each leaf with an `onResolve` plugin that throws
  on `node:*` and a server-dir denylist — i.e. it tests the literal property (a clean browser
  bundle), the same way the repo already bundles the playground client with esbuild
  (SPEC-PLAYGROUND-UI §2). A failing transitive import fails CI. (Optional fast pre-commit layer:
  `eslint-plugin-import` `no-restricted-paths` zone forbidding these files from importing
  `services/`/`controllers/`/`scraper/`/`db`/`winston`.)

Status mapping `ERROR_CATALOG` encodes (fixes DNS-as-200, client-caused-500 — RESPONSE-MODEL #2):

| Status | Codes (examples)                                                                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `RequestError.BAD_REQUEST`, `BAD_REQUEST_INVALID_JSON`, `MonitorError.EMAIL_TOKEN_INVALID`                                                                                                                            |
| 401    | `AuthError.MISSING_API_KEY`, `INVALID_API_KEY`, `OAUTH_TOKEN_EXPIRED`                                                                                                                                                 |
| 402    | `BillingError.INSUFFICIENT_CREDITS`, `UNVERIFIED_CREDIT_LIMIT`                                                                                                                                                        |
| 403    | `AuthError.TEAM_SUSPENDED`, `GatingError.URL_BLOCKED`, `COUNTRY_RESTRICTED`, `AuthError.KEY_NOT_KEYLESS_ELIGIBLE`, `BrowserError.SESSION_FORBIDDEN`                                                                   |
| 404    | `LifecycleError.JOB_NOT_FOUND`, `JOB_EXPIRED`, `JOB_WRONG_TEAM`, `BrowserError.SESSION_NOT_FOUND`, `MonitorError.MONITOR_NOT_FOUND`, `CHECK_NOT_FOUND`, `FeedbackError.TARGET_NOT_FOUND`, `ProxyError.NOT_CONFIGURED` |
| 408    | `ScrapeError.TIMEOUT`, `MapError.TIMEOUT`, `DependencyError.TIMEOUT`, `ProxyError.UPSTREAM_TIMEOUT`                                                                                                                   |
| 409    | `GatingError.IDEMPOTENCY_CONFLICT`, `LifecycleError.JOB_CANCELLED`, `MonitorError.CONFLICT`                                                                                                                           |
| 410    | `BrowserError.SESSION_EXPIRED`, `MonitorError.EMAIL_TOKEN_EXPIRED`, `FeedbackError.WINDOW_EXPIRED`                                                                                                                    |
| 422    | `ScrapeError.ACTIONS_NOT_SUPPORTED`, `BRANDING_NOT_SUPPORTED`, `UNSUPPORTED_FILE`, `LifecycleError.ZDR_NOT_SUPPORTED`, `LocalError.FEATURE_UNSUPPORTED`, `BrowserError.EXECUTION_FAILED`                              |
| 429    | `RateError.RATE_LIMIT_EXCEEDED`, `QUEUE_FULL`, `BrowserError.SESSION_LIMIT_EXCEEDED`                                                                                                                                  |
| 502    | `ScrapeError.ALL_ENGINES_FAILED`, `DependencyError.UNAVAILABLE`, `AgentError.UPSTREAM`, `ProxyError.UPSTREAM_BAD_RESPONSE`, `ProxyError.UPSTREAM_UNAVAILABLE`                                                         |
| 503    | `AuthError.BACKEND_UNAVAILABLE`, `BillingError.UNAVAILABLE`, `BrowserError.SERVICE_UNAVAILABLE`, `FeedbackError.DB_UNAVAILABLE`                                                                                       |
| 500    | `CommonError.UNKNOWN` and any unmapped code (default)                                                                                                                                                                 |

---

## 6. Scope of the migration (accurate surface)

This is broad on purpose. The new response envelope applies to **all non-streaming v2 JSON
responses**. Ignore older v1/v0 behavior except for mechanical compile fallout from shared
`ErrorCodes`.

- **Magic-string comparisons:** 17 sites → enum members (§2): `scrape.ts` ×7, `parse.ts` ×5,
  `v1/scrape.ts` ×5.
- **`ResponseCore` fields become required:** every client-facing v2 JSON response gets
  `status` and `diagnostics`. The response builder in `controllers/v2/response-enveloper.ts` is the
  intended forcing function; do not hand-roll these fields at each site.
- **`code` becomes required on failures:** every request-level `ErrorResponse` and async
  `AsyncJobFailureResponse` must supply a dominant/root-cause code. This includes many ad-hoc
  returns that today are bare strings, plus untyped escape hatches that TypeScript will not catch.
- **Status normalization:** route those error returns + the **3 `TransportableError` status ladders**
  (`scrape.ts:397`, `parse.ts:606`, `v1:259`) + the **~6 shared-middleware gates**
  (auth/credits/rate/blocklist/country/idempotency) through `errorCodeToHttpStatus`.
- **`details` transport:** add `details` to `TransportableError.serialize()`/`deserialize()` and
  thread it through the **~30 subclasses** (each has its own `serialize`/static `deserialize` and a
  constructor that doesn't currently accept `details`) — or centralize reconstruction so subclasses
  don't each need editing.
- **Warnings:** add `warnings?: Warning[]` to each v2 response type; convert the 16 producers
  to also push a typed entry (keeping their `warning` string assignment); build `warnings[]` inline
  per endpoint.
- **Async job failures:** crawl/batch, scrape status, extract status, and agent status use
  `AsyncJobFailureResponse` for terminal job failure. Status lookup failures still use
  `ErrorResponse`. Async status/cancel responses add `jobState`.
- **Proxy/keyless coverage:** locally generated support/research proxy failures are normalized into
  the envelope with `ProxyError.*`. Upstream responses that are genuinely pass-through may remain
  pass-through. `keyless/eligibility` errors also get the envelope because consumers and the
  playground need to know why eligibility failed.
- **Typed escape hatches:** `Response<...>` typing will not catch every v2 error. Guard with static
  grep/tests for `res.status(4xx|5xx).json({ error`, `success:false` without `code`, and
  `res.status(4xx|5xx).end()` in v2 controllers/routes.

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
thrown — they're plain `Warning` data that rides the normal JSON result (the existing
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
5. Add `controllers/v2/response-enveloper.ts` with v2-local builders for diagnostics/privacy,
   success, warning, request error, and async job failure responses. Do not place this in `lib/`;
   future API versions may need a different envelope.
6. Make `status`/`diagnostics` required on all client-facing v2 JSON response types; make `code`
   required on `ErrorCore`; add `AsyncJobFailureResponse<TData>` + async `jobState`.
7. Assign codes to every ad-hoc request-level and async failure return; route request-level failure
   HTTP status through `errorCodeToHttpStatus` (controllers + ladders + middleware).
8. `errorId` on the opaque path only (Sentry id, else logged uuid); improve the opaque message.
9. Add `warnings?: Warning[]` per v2 response; convert the 16 producers to push typed entries
   inline (keep `warning` string). Use `status:"warning"` whenever `warnings[]` or legacy `warning`
   is present, including async completed/cancelled responses.

Backward-compat: new fields are additive; `warning` string preserved; the deliberate behavior
changes are **HTTP status normalization** and **`error` message wording** (real context instead of
"check your logs") — call both out in release notes.

## 10. Tests (snips + unit)

- **Two completeness unit tests**: `ERROR_CATALOG` covers every `ErrorCodes` member and
  `WARNING_CATALOG` every `WarningCodes` member (the `Record<…>` types enforce at compile time;
  tests guard `@ts-expect-error` slips and assert sane `httpStatus`).
- Response-envelope unit tests: builders always include `status` + `diagnostics.privacy`; warnings
  force `status:"warning"`; async failures require `code` + `jobState:"failed"`; request errors use
  `errorCodeToHttpStatus`.
- Failure-path snips: assert `code` (as the enum value) and `errorCodeToHttpStatus` per group
  (auth 401, billing 402, rate 429, lifecycle 404, browser/monitor/proxy/feedback specifics,
  engines 502, dependency 502/503, local 422).
  Assert typed errors carry **no `errorId`**, and the opaque `UNKNOWN_ERROR` path carries one only
  when Sentry is configured.
- Async job snips: crawl/batch kickoff failure, failed scrape-status, failed extract-status, and
  failed agent-status return `AsyncJobFailureResponse` with `status:"failed"`, required dominant
  `code`, optional `failureCount`/`failuresByCode`, and `diagnostics`.
- Warning snips: assert structured `warnings[]` entries **and** that the `warning` string still
  contains the original legacy text verbatim (preserved, not derived) — e.g. media-unavailable,
  extract-trimmed, crawl few-results. Assert responses with warnings use `status:"warning"`.
- ZDR/privacy snips: request-scoped and team-forced ZDR responses include
  `diagnostics.privacy.zeroDataRetention === true`; diagnostics are reduced and do not include URL
  path/query, request options, selectors/actions, content, prompts, or cross-system trace ids.
- Static guard: no v2 `success:false` JSON without `code`; no `res.status(4xx|5xx).json({ error`
  bare envelope; no `res.status(4xx|5xx).end()` in v2 controllers/routes unless explicitly marked
  as pass-through proxy behavior.
- Gate fire-engine cases behind `!process.env.TEST_SUITE_SELF_HOSTED`; AI cases behind
  `!process.env.TEST_SUITE_SELF_HOSTED || OPENAI_API_KEY || OLLAMA_BASE_URL`; use `scrapeTimeout`
  from `./lib`.

## 11. Phase 2 — SDK/OpenAPI alignment

Do not block Phase 1 API implementation on SDK work. After the v2 API envelope is green, update
public client surfaces in a follow-up phase:

- `apps/api/openapi.json`: add `ResponseStatus`, `Diagnostics`, `Warning`, required `code`,
  `status`, and `diagnostics`; model async job failure separately from request-level `ErrorResponse`.
- `apps/js-sdk/firecrawl/src/v2/*`: type `code`, `status`, `errorId`, `details`, `diagnostics`,
  structured `warnings[]`, and async `jobState`; keep runtime pass-through behavior where possible.
- `apps/python-sdk/firecrawl/v2/*`: same type alignment.

Runtime SDK parsing should remain tolerant of unknown fields. The main Phase 2 requirement is that
typed clients and generated docs reflect the new response contract.
