# Impl Plan — ErrorCodes / WarningCodes Refactor

Agent-executable plan for [SPEC-ERRORCODES.md](./SPEC-ERRORCODES.md). The spec is the **what/why**;
this is the **how/in-what-order**. Read the spec section referenced in each work package before
editing.

All paths are relative to `apps/api/src/` unless noted.

## How to use this plan

- Work packages (WP) are ordered by dependency. The **dependency graph** below shows what can run in
  parallel.
- After each WP, run its **Verify** step. The two repo-wide gates are:
  - `pnpm exec tsc --noEmit` (from `apps/api`) — type check.
  - `pnpm harness jest <path>` — run snips (never `pnpm start`). Full suite is slow; run the
    touched area locally, let CI do the rest.
  - Pre-commit `knip` must pass — do **not** `--no-verify`. New exports must be imported somewhere
    or knip fails; if you add a code/enum you must also add its catalog entry (it's consumed there).
- **Build-state expectations** are stated per WP. WP1–WP4 each end **green**. WP5 deliberately goes
  **red** (making the v2 envelope required) and WP6 drives it back to **green**. Don't "fix" the
  WP5 red by reverting — finish WP6.
- Magic strings: once WP1 lands, **never** introduce `e.code === "STRING"`; always
  `e.code === ScrapeError.TIMEOUT`. (A grep gate is added in WP9.)

## Dependency graph

```
WP1 (enums + enum fallout) ──┬──> WP2 (catalogs)        ──┐
                             ├──> WP3 (details + serde) ──┼──> WP4 (v2 response-enveloper helper)
                             └──> WP7 (warnings data)  ───┘        └──> WP5 (types: required envelope; RED)
                                                                          └──> WP6 (migrate responses; GREEN)
                                                                                 └──> WP8 (errorId + diagnostics hardening)
                                                                                        └──> WP9 (tests + guards)
                                                                                               └──> WP10 (SDK/OpenAPI phase)
```

- WP2, WP3, WP7 can run in parallel after WP1 (different files; coordinate on response types in WP5).
- WP4 needs WP2 (catalog) + WP3 (details types). WP5 needs WP4. WP6 needs WP5. WP8 needs WP6.
  WP9 last for Phase 1. WP10 is a separate follow-up phase.

---

## WP1 — Code enums + absorb the enum-change fallout (ends GREEN)

**Goal:** replace the flat `ErrorCodes` union with per-category enums, keeping every string value,
and fix everything the enum change breaks — _without_ yet touching the envelope. Pure refactor, no
behavior change.

**Spec:** §2, §3. **Mappings:** Appendix A (code→enum), Appendix D (comparison sites), Appendix E
(importers).

Steps:

1. Create `lib/error-codes.ts` with the error enums (§2), including the new specific
   `BrowserError`, `MonitorError`, `ProxyError`, `FeedbackError`, and `CrawlError.DENIAL`
   categories, plus the warning enums (§3). Fill `ScrapeError` with **all** existing `SCRAPE_*`
   values (Appendix A) — the spec elides them with `/* … */`.
2. In `lib/error.ts`, delete the inline `ErrorCodes` union and `export { ErrorCodes } from
"./error-codes"` (re-export) so the ~6 importers in Appendix E keep working unchanged.
3. Fix the things the enum type breaks (all compile errors today):
   - `lib/error-serde.ts`: `errorMap` keys → computed enum keys (`[ScrapeError.TIMEOUT]: …`);
     in `deserializeTransportableError`, index with `errorMap[code as ErrorCodes]` (wire gives a raw
     string).
   - `services/sentry.ts`: the `transportableErrorCodes` array → enum members.
   - The **17 comparison sites** (Appendix D): `e.code === "X"` → `e.code === Enum.MEMBER`.
4. Subclass `super("SCRAPE_TIMEOUT")` calls in `lib/error.ts` + `scraper/scrapeURL/error.ts` →
   `super(ScrapeError.TIMEOUT)` (optional but encouraged — removes the last magic strings).

**Verify:** `pnpm exec tsc --noEmit` clean; `pnpm harness jest __tests__/snips/v2/scrape` still
green (no behavior change). **End state: GREEN.**

---

## WP2 — Catalogs (ends GREEN)

**Goal:** `lib/error-catalog.ts` with `ERROR_CATALOG` + `WARNING_CATALOG` + helpers (§5).

**Spec:** §5. Depends on WP1.

Steps:

1. Create `lib/error-catalog.ts` (browser-safe: only imports from `error-codes.ts`). Use computed
   enum keys. Fill an `ErrorCatalogEntry` for **every** `ErrorCodes` member (incl.
   `CrawlError.DENIAL`) and a `WarningCatalogEntry` for every `WarningCodes` member — the
   `Record<…>` type makes a miss a compile error.
2. Use the §5 status table for `httpStatus`. Write a real `explanation` + `fix` per code (this is the
   user-facing transparency text; the playground renders it).
3. Export `errorCodeToHttpStatus`, `explainError`, `explainWarning`, and the wire-boundary
   validators `parseErrorCode` / `parseWarningCode` (derived from the catalog key sets — §5). Also
   add `makeWarning` here (or beside the warning enums) — the pure anti-drift helper (§4 warnings).
4. Add the browser-safety CI guard: an esbuild `platform:"browser"` bundle test over
   `error-codes.ts` / `error-details.ts` / `error-catalog.ts` that fails on any node/server import
   (SPEC-ERRORCODES §5 guardrail).

**Verify:** `pnpm exec tsc --noEmit` clean (a missing catalog entry fails here). **End state: GREEN.**

---

## WP3 — Details types + `TransportableError.details` transport (ends GREEN)

**Goal:** add the typed `details` channel and make it survive serialization.

**Spec:** §4a, §7. Depends on WP1.

Steps:

1. Create `lib/error-details.ts` (§4a): `ErrorDetailsMap`, `WarningDetailsMap`, `ErrorDetails`,
   `WarningDetails`, `ErrorDetailsFor<C>`, `WarningDetailsFor<C>`.
2. `lib/error.ts`: add `readonly details?: ErrorDetails` to `TransportableError`; include it in
   `serialize()`; thread it through `deserialize`.
3. Subclasses (Appendix B, ~31 across `lib/error.ts` + `scraper/scrapeURL/error.ts`): the cheapest
   route is to centralize — have base `serialize()` emit `details` and base `deserialize` restore it,
   so subclasses only need a constructor arg where they _want_ to set `details`. Don't add `details`
   to subclasses that carry none (§4a "no details" list).
4. Lift the obvious structured data into `details` for the mapped scrape codes (§4a): e.g.
   `DNSResolutionError` → `{ hostname }`, `NoEnginesLeftError` → `{ enginesTried }`,
   `ActionError` → action index/selector if available.

**Verify:** `pnpm exec tsc --noEmit` clean; a serde round-trip snip preserves `code` + `details`.
**End state: GREEN.**

---

## WP4 — v2 response-enveloper helper (ends GREEN)

**Goal:** create the v2-local builder layer that will stamp `status`, `diagnostics.privacy`, and
HTTP status consistently. This is deliberately under `controllers/v2/`, not `lib/`, so future API
versions can choose a different envelope.

**Spec:** §4, §6. Depends on WP2, WP3.

Steps:

1. Create `controllers/v2/response-enveloper.ts`.
2. Export the type helpers or builder inputs needed by controllers:
   - `buildDiagnosticsPrivacy(reqOrContext, opts)` / `diagnosticsForRequest(...)`
   - `okResponse(body, ctx)`
   - `warningResponse(body, warnings, ctx)`
   - `errorResponse(code, error, ctx, opts)`
   - `asyncJobFailureResponse(code, error, ctx, opts)`
3. The helper must:
   - always include `diagnostics.privacy`
   - set `status:"warning"` whenever structured `warnings[]` or legacy `warning` is present
   - set `status:"failed"` for `ErrorCore`
   - route request-level error HTTP status through `errorCodeToHttpStatus`
   - leave async job failures as HTTP 200 status responses unless the status lookup itself failed
   - support ZDR `privacy.mode` values: `disabled`, `allowed`, `forced`, `request`,
     `not_applicable`
4. Add focused unit tests for helper behavior before using it broadly.

**Verify:** `pnpm exec tsc --noEmit` clean; helper unit tests pass. **End state: GREEN.**

---

## WP5 — Envelope types: required `status`/`diagnostics` + async failure (goes RED on purpose)

**Goal:** flip v2 response types to the target shape. This makes response sites missing the new
fields/code fail, and WP6 resolves them through the helper.

**Spec:** §4, §6. Depends on WP4.

Steps:

1. `controllers/v2/types.ts`:
   - add `ResponseStatus`, `JobState`, `Diagnostics`, `DiagnosticStep`, `ResponseCore`,
     `ErrorCore`, `ErrorResponse`, `AsyncJobFailureResponse<TData>`, and `Warning` (the envelope
     occurrence type — NOT the catalog's `WarningCatalogEntry`)
   - `ErrorResponse.code` is required
   - `diagnostics` is required on every client-facing v2 JSON response
   - `status` is required on every client-facing v2 JSON response
   - async status responses add `jobState`; terminal failed jobs use `AsyncJobFailureResponse`
   - `warning?: string` stays; add `warnings?: Warning[]`
2. Do **not** change v1/v0 response envelopes except mechanical enum comparison fixes from WP1.

**Verify:** `pnpm exec tsc --noEmit` now reports missing `status`/`diagnostics`/`code` at v2
response sites — expected. Capture both `tsc` output and the grep audit below as the WP6 worklist.
**End state: RED (intended).**

---

## WP6 — Migrate v2 responses, codes, and status normalization (drives back to GREEN)

**Goal:** every non-streaming v2 JSON response uses the v2 envelope, and every request-level or
async failure has a specific code.

**Spec:** §4, §5, §6. Depends on WP5. This is the largest WP — split by controller across agents.

Surface (verified): **~191 `res.status().json()` sites in v2 controllers** (mix of success/error),
the **3 `TransportableError` status ladders** (`scrape.ts:397`, `parse.ts:606`, `v1:259`), and
**~6 middleware gates** (auth/credits/rate/blocklist/country/idempotency in `routes/shared.ts` +
`controllers/auth.ts`). TypeScript will not catch every case: `crawl-cancel.ts`,
`support-proxy.ts`, `research-proxy.ts`, `keyless-eligibility.ts`, raw `Response`, `.end()`, and
pass-through proxy bodies need manual audit.

Steps (per controller / middleware):

1. Replace hand-built v2 JSON responses with `controllers/v2/response-enveloper.ts` builders.
2. For each request-level error return, pick the right `ErrorCodes` member. Prefer specific
   categories (`BrowserError`, `MonitorError`, `ProxyError`, `FeedbackError`) over broad lifecycle
   reuse when the surface is distinct. Attach `details` where §4a defines a shape.
3. Replace hardcoded request-error `res.status(N)` with `errorResponse(...)` /
   `errorCodeToHttpStatus(code)`. Leave success HTTP 200 alone.
4. Collapse the 3 `TransportableError` ladders to `errorCodeToHttpStatus(e.code)`.
5. Middleware emits auth/billing/rate/gating codes + details instead of bare strings.
6. Async status endpoints:
   - crawl/batch status: status lookup errors use `ErrorResponse`; terminal job failures use
     `AsyncJobFailureResponse<Document[]>`; add `failureCount`/`failuresByCode` when available
   - scrape status: known failed scrape jobs return `AsyncJobFailureResponse<unknown>` instead of a
     misleading request-level 404; truly missing/wrong-team jobs stay request-level errors
   - extract/agent status: terminal failed jobs return `AsyncJobFailureResponse<unknown>`
   - async success/status responses include `jobState`
7. Cancellation is a successful terminal job state. Use `success:true` with `jobState:"cancelled"`;
   if warnings exist, top-level `status:"warning"` overrides `ok`.
8. Locally generated support/research proxy failures normalize to `ProxyError.*`. Genuinely
   pass-through upstream responses may remain pass-through.
9. `keyless/eligibility` errors use the envelope.

Manual audit commands:

- `rg -n "success: false" apps/api/src/controllers/v2 apps/api/src/routes/v2.ts apps/api/src/routes/shared.ts`
- `rg -n "status\\([45][0-9][0-9]\\)\\.json\\(\\{ error|status\\([45][0-9][0-9]\\)\\.end\\(" apps/api/src/controllers/v2 apps/api/src/routes/v2.ts`

**Verify:** `pnpm exec tsc --noEmit` clean again; run the v2 snips for each touched controller.
**End state: GREEN.**

---

## WP7 — Structured warnings (ends GREEN; parallelizable after WP1/WP3)

**Goal:** every v2 success/partial response can carry `warnings[]`; the 16 producers push typed
entries; `warning` string preserved.

**Spec:** §3, §4 (warnings), §8. **Edit list:** Appendix C. Depends on WP1 (warning enums) + WP3
(`WarningDetails`). Coordinate final response surfacing with WP5/WP6.

Steps:

1. At each of the 16 producers (Appendix C): keep the existing `warning = …` / `document.warning =
…` assignment **and** produce a parallel `{ code: <WarningEnum>, message: <same text>, details? }`
   entry.
2. Scrape-pipeline warnings may ride the worker result as plain JSON transport detail, but
   `warnings[]` remains an envelope-level field built/lifted by the controller. Do not treat
   `Document.warning` as the canonical structured warning store.
3. In each v2 response builder, surface the collected `warnings[]`; the response helper must set
   `status:"warning"` whenever warning data exists. No shared collector class.

**Verify:** snips assert `warnings[]` entries **and** the legacy `warning` string still contains the
verbatim text (§10). **End state: GREEN.**

---

## WP8 — `errorId` scoped to the opaque path + diagnostics hardening

**Goal:** `errorId` only on opaque/log-correlated paths, and diagnostics obey the public/ZDR
contract.

**Spec:** §4 (errorId + diagnostics semantics). Depends on WP6.

Steps:

1. Add a small helper (NOT in `getErrorContactMessage`) used only on the opaque path: capture →
   obtain id (`res.sentry` in the global handler; the `captureExceptionWithZdrCheck` return id at
   controller catches) → return `{ errorId? , message }`. Set `errorId` only when an id genuinely
   exists (Sentry) or fall back to the logged uuid for self-host log-grep.
2. Ensure typed-error returns (WP6) do **not** set `errorId`.
3. Improve the opaque `error` message to carry safe context beyond "check your logs" where possible.
4. `getErrorContactMessage` stays a pure formatter — no logging added.
5. Ensure diagnostics are generated through the ZDR-aware helper:
   - no URL path/query, request bodies/options, selectors/actions, content, prompts/completions,
     response bodies, or cross-system trace ids under ZDR
   - include `diagnostics.privacy.mode` and `reduced`
   - use `not_applicable` only for endpoints that do not process/retain customer scrape/search
     content

**Verify:** snips — typed error has no `errorId`; forced unexpected error has one only with Sentry
configured/non-ZDR or a real local log id when allowed; ZDR responses have reduced diagnostics.
**End state: GREEN.**

---

## WP9 — Tests + guards

**Spec:** §10. Depends on all.

Steps:

1. Two completeness unit tests: `ERROR_CATALOG` over `ErrorCodes`, `WARNING_CATALOG` over
   `WarningCodes` (with a `@ts-expect-error` guard test and an `httpStatus` sanity assert).
2. Response-envelope helper unit tests: required `diagnostics.privacy`, warning status override,
   async job failure shape, request-error HTTP status mapping.
3. Failure-path snips per group (auth 401, billing 402, rate 429, lifecycle 404, browser/monitor/
   proxy/feedback specifics, engines 502, dependency 502/503, local 422) asserting `code`,
   `status:"failed"`, and diagnostics.
4. Async job snips asserting `AsyncJobFailureResponse` with required dominant `code`,
   `jobState:"failed"`, and aggregate fields where available.
5. Warning snips (media/extract/crawl) asserting structured `warnings[]`, verbatim `warning`, and
   `status:"warning"`.
6. ZDR/privacy snips asserting `diagnostics.privacy.zeroDataRetention`, `mode`, `reduced`, and
   absence of prohibited diagnostic fields.
7. A magic-string guard: a unit test / CI grep asserting no `\.code === "[A-Z_]+"` remains in
   `controllers/` and `scraper/`.
8. Envelope guard: no v2 `success:false` JSON without `code`; no bare
   `res.status(4xx|5xx).json({ error`; no `res.status(4xx|5xx).end()` in v2 controllers/routes
   unless explicitly marked pass-through proxy behavior.
9. Gating: fire-engine cases behind `!process.env.TEST_SUITE_SELF_HOSTED`; AI behind
   `!process.env.TEST_SUITE_SELF_HOSTED || OPENAI_API_KEY || OLLAMA_BASE_URL`; `scrapeTimeout` from
   `./lib`.

---

## WP10 — SDK/OpenAPI follow-up phase

**Goal:** align public typed clients and generated docs after Phase 1 API behavior is green.

**Spec:** §11. Do not block Phase 1 on this WP.

Steps:

1. `apps/api/openapi.json`: model `ResponseStatus`, `Diagnostics`, `Warning`,
   `ErrorResponse`, and `AsyncJobFailureResponse`; mark `status`, `diagnostics`, and failure `code`
   as required.
2. `apps/js-sdk/firecrawl/src/v2/*`: update response/error/warning types; keep runtime parsing
   tolerant of unknown fields.
3. `apps/python-sdk/firecrawl/v2/*`: same type alignment.

**Verify:** SDK type checks/tests for touched packages; OpenAPI validation if available.

---

## Open deps to resolve before WP5

- **Diagnostics is now defined here**, not deferred to RESPONSE-MODEL. Implement the type in
  `controllers/v2/types.ts` and construct it through `controllers/v2/response-enveloper.ts`.
- **New codes with no thrower yet** (most of auth/billing/rate/gating/lifecycle/browser/monitor/
  proxy/feedback/dependency) are fine to define; they get wired in WP6. Knip won't complain because
  each is consumed by its catalog entry.

---

## Appendix A — existing code → enum member (all current codes)

| current `ErrorCodes` value             | enum member                              |
| -------------------------------------- | ---------------------------------------- |
| `SCRAPE_TIMEOUT`                       | `ScrapeError.TIMEOUT`                    |
| `MAP_TIMEOUT`                          | `MapError.TIMEOUT`                       |
| `UNKNOWN_ERROR`                        | `CommonError.UNKNOWN`                    |
| `SCRAPE_ALL_ENGINES_FAILED`            | `ScrapeError.ALL_ENGINES_FAILED`         |
| `SCRAPE_SSL_ERROR`                     | `ScrapeError.SSL`                        |
| `SCRAPE_SITE_ERROR`                    | `ScrapeError.SITE`                       |
| `SCRAPE_PROXY_SELECTION_ERROR`         | `ScrapeError.PROXY_SELECTION`            |
| `SCRAPE_PDF_PREFETCH_FAILED`           | `ScrapeError.PDF_PREFETCH_FAILED`        |
| `SCRAPE_DOCUMENT_PREFETCH_FAILED`      | `ScrapeError.DOCUMENT_PREFETCH_FAILED`   |
| `SCRAPE_JOB_CANCELLED`                 | `ScrapeError.JOB_CANCELLED`              |
| `SCRAPE_RETRY_LIMIT`                   | `ScrapeError.RETRY_LIMIT`                |
| `SCRAPE_ZDR_VIOLATION_ERROR`           | `ScrapeError.ZDR_VIOLATION`              |
| `SCRAPE_DNS_RESOLUTION_ERROR`          | `ScrapeError.DNS`                        |
| `SCRAPE_PDF_INSUFFICIENT_TIME_ERROR`   | `ScrapeError.PDF_INSUFFICIENT_TIME`      |
| `SCRAPE_PDF_ANTIBOT_ERROR`             | `ScrapeError.PDF_ANTIBOT`                |
| `SCRAPE_PDF_OCR_REQUIRED`              | `ScrapeError.PDF_OCR_REQUIRED`           |
| `SCRAPE_DOCUMENT_ANTIBOT_ERROR`        | `ScrapeError.DOCUMENT_ANTIBOT`           |
| `SCRAPE_UNSUPPORTED_FILE_ERROR`        | `ScrapeError.UNSUPPORTED_FILE`           |
| `SCRAPE_ACTION_ERROR`                  | `ScrapeError.ACTION`                     |
| `SCRAPE_RACED_REDIRECT_ERROR`          | `ScrapeError.RACED_REDIRECT`             |
| `SCRAPE_NO_CACHED_DATA`                | `ScrapeError.NO_CACHED_DATA`             |
| `SCRAPE_LOCKDOWN_CACHE_MISS`           | `ScrapeError.LOCKDOWN_CACHE_MISS`        |
| `SCRAPE_SITEMAP_ERROR`                 | `ScrapeError.SITEMAP`                    |
| `SCRAPE_ACTIONS_NOT_SUPPORTED`         | `ScrapeError.ACTIONS_NOT_SUPPORTED`      |
| `SCRAPE_BRANDING_NOT_SUPPORTED`        | `ScrapeError.BRANDING_NOT_SUPPORTED`     |
| `SCRAPE_AUDIO_UNSUPPORTED_URL`         | `ScrapeError.AUDIO_UNSUPPORTED_URL`      |
| `SCRAPE_VIDEO_UNSUPPORTED_URL`         | `ScrapeError.VIDEO_UNSUPPORTED_URL`      |
| `SCRAPE_X_TWITTER_CONFIGURATION_ERROR` | `ScrapeError.X_TWITTER_CONFIGURATION`    |
| `AGENT_INDEX_ONLY`                     | `AgentError.INDEX_ONLY`                  |
| `MAP_FAILED`                           | `MapError.FAILED`                        |
| `CRAWL_DENIAL`                         | `CrawlError.DENIAL`                      |
| `PARSE_UNSUPPORTED_OPTIONS`            | `RequestError.PARSE_UNSUPPORTED_OPTIONS` |
| `BAD_REQUEST`                          | `RequestError.BAD_REQUEST`               |
| `BAD_REQUEST_INVALID_JSON`             | `RequestError.BAD_REQUEST_INVALID_JSON`  |

## Appendix B — subclass → code (from `errorMap`, `lib/error-serde.ts`)

`ScrapeJobTimeoutError`→`ScrapeError.TIMEOUT`; `MapTimeoutError`→`MapError.TIMEOUT`;
`UnknownError`→`CommonError.UNKNOWN`; `NoEnginesLeftError`→`ScrapeError.ALL_ENGINES_FAILED`;
`SSLError`→`ScrapeError.SSL`; `SiteError`→`ScrapeError.SITE`;
`ProxySelectionError`→`ScrapeError.PROXY_SELECTION`; `PDFPrefetchFailed`→`ScrapeError.PDF_PREFETCH_FAILED`;
`DocumentPrefetchFailed`→`ScrapeError.DOCUMENT_PREFETCH_FAILED`;
`ScrapeJobCancelledError`→`ScrapeError.JOB_CANCELLED`; `ScrapeRetryLimitError`→`ScrapeError.RETRY_LIMIT`;
`ZDRViolationError`→`ScrapeError.ZDR_VIOLATION`; `DNSResolutionError`→`ScrapeError.DNS`;
`PDFInsufficientTimeError`→`ScrapeError.PDF_INSUFFICIENT_TIME`; `PDFAntibotError`→`ScrapeError.PDF_ANTIBOT`;
`PDFOCRRequiredError`→`ScrapeError.PDF_OCR_REQUIRED`; `DocumentAntibotError`→`ScrapeError.DOCUMENT_ANTIBOT`;
`UnsupportedFileError`→`ScrapeError.UNSUPPORTED_FILE`; `ActionError`→`ScrapeError.ACTION`;
`RacedRedirectError`→`ScrapeError.RACED_REDIRECT`; `NoCachedDataError`→`ScrapeError.NO_CACHED_DATA`;
`LockdownMissError`→`ScrapeError.LOCKDOWN_CACHE_MISS`; `SitemapError`→`ScrapeError.SITEMAP`;
`ActionsNotSupportedError`→`ScrapeError.ACTIONS_NOT_SUPPORTED`;
`BrandingNotSupportedError`→`ScrapeError.BRANDING_NOT_SUPPORTED`; `AgentIndexOnlyError`→`AgentError.INDEX_ONLY`;
`AudioUnsupportedUrlError`→`ScrapeError.AUDIO_UNSUPPORTED_URL`;
`VideoUnsupportedUrlError`→`ScrapeError.VIDEO_UNSUPPORTED_URL`;
`XTwitterConfigurationError`→`ScrapeError.X_TWITTER_CONFIGURATION`; `MapFailedError`→`MapError.FAILED`;
`CrawlDenialError`→`CrawlError.DENIAL`. (Zod codes `BAD_REQUEST`/`BAD_REQUEST_INVALID_JSON`/
`PARSE_UNSUPPORTED_OPTIONS` map to `null` in `errorMap` — no class.)

## Appendix C — the 16 warning producers (WP7 edit list)

| file:line                            | warning enum to push                           |
| ------------------------------------ | ---------------------------------------------- |
| `scraper/scrapeURL/index.ts:1019`    | `ScrapeWarning.ENGINE_PARTIAL_FEATURES`        |
| `…/transformers/llmExtract.ts:192`   | `ExtractWarning.CONTENT_TRIMMED_CHARS`         |
| `…/transformers/llmExtract.ts:210`   | `ExtractWarning.CONTENT_TRIMMED_TOKENS`        |
| `…/transformers/llmExtract.ts:225`   | `ExtractWarning.TOKEN_COUNT_FAILED`            |
| `…/transformers/llmExtract.ts:1159`  | `ExtractWarning.CLEANING_SKIPPED_TOO_LONG`     |
| `…/transformers/query.ts:211`        | `QueryWarning.ZDR_UNSUPPORTED`                 |
| `…/transformers/query.ts:218`        | `QueryWarning.NO_MARKDOWN`                     |
| `…/transformers/query.ts:227`        | `QueryWarning.EMPTY_MARKDOWN`                  |
| `…/transformers/query.ts:248`        | `QueryWarning.GENERATION_FAILED`               |
| `…/transformers/query.ts:265`        | `QueryWarning.HIGHLIGHTS_FAILED`               |
| `…/transformers/diff.ts:85`          | `ChangeTrackingWarning.ZDR_UNSUPPORTED`        |
| `…/transformers/diff.ts:101`         | `ChangeTrackingWarning.COMPARE_FAILED`         |
| `…/transformers/diff.ts:272`         | `ChangeTrackingWarning.STRUCTURED_DIFF_FAILED` |
| `…/transformers/audio.ts:54`         | `MediaWarning.AUDIO_UNAVAILABLE`               |
| `…/transformers/video.ts:210`        | `MediaWarning.VIDEO_UNAVAILABLE`               |
| `controllers/v2/crawl-status.ts:364` | `CrawlWarning.FEW_RESULTS`                     |

(Line numbers drift — re-grep `document.warning =` / `warning =` in each file before editing.)

## Appendix D — the 17 magic-string comparison sites (WP1)

`controllers/v2/scrape.ts`: lines 324, 340, 351, 362, 373, 386, 397 (`SCRAPE_TIMEOUT`,
`SCRAPE_DNS_RESOLUTION_ERROR`, `SCRAPE_NO_CACHED_DATA`, `SCRAPE_LOCKDOWN_CACHE_MISS`,
`AGENT_INDEX_ONLY`, `SCRAPE_ACTIONS_NOT_SUPPORTED`, `SCRAPE_TIMEOUT`).
`controllers/v2/parse.ts`: lines 555, 571, 582, 595, 606.
`controllers/v1/scrape.ts`: lines 223, 233, 241, 251, 259.

## Appendix E — `ErrorCodes` importers (WP1 step 2)

`controllers/v2/types.ts`, `controllers/v1/types.ts`, `services/sentry.ts`
(`transportableErrorCodes` array), `lib/error.ts` (defines → re-exports), `lib/error-serde.ts`,
`scraper/scrapeURL/error.ts`. Re-exporting `ErrorCodes` from `lib/error.ts` keeps these unchanged
except `error.ts` itself.
