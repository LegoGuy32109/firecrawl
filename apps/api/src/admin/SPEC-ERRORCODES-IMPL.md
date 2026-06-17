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
- **Build-state expectations** are stated per WP. WP1–WP3 each end **green**. WP4 deliberately goes
  **red** (making `code` required) and WP5 drives it back to **green**. Don't "fix" the WP4 red by
  reverting — finish WP5.
- Magic strings: once WP1 lands, **never** introduce `e.code === "STRING"`; always
  `e.code === ScrapeError.TIMEOUT`. (A grep gate is added in WP8.)

## Dependency graph

```
WP1 (enums + fix enum-change fallout)  ──┬──> WP2 (catalogs)        ──┐
                                         ├──> WP3 (details + serde) ──┼──> WP4 (envelope: code required)
                                         └──> WP6 (warnings)  ────────┘        └──> WP5 (assign codes + status) ──> WP7 (errorId) ──> WP8 (tests)
```

- WP2, WP3, WP6 can run in parallel after WP1 (different files; coordinate on response types in WP6).
- WP4 needs WP2 (catalog) + WP3 (details types). WP5 needs WP4. WP7 needs WP5. WP8 last.

---

## WP1 — Code enums + absorb the enum-change fallout (ends GREEN)

**Goal:** replace the flat `ErrorCodes` union with per-category enums, keeping every string value,
and fix everything the enum change breaks — _without_ yet touching the envelope. Pure refactor, no
behavior change.

**Spec:** §2, §3. **Mappings:** Appendix A (code→enum), Appendix D (comparison sites), Appendix E
(importers).

Steps:

1. Create `lib/error-codes.ts` with the error enums (§2) **plus `CrawlError { DENIAL =
"CRAWL_DENIAL" }`** (Appendix A flags this; §2 omitted it) and the warning enums (§3). Add
   `CrawlError` to the `ErrorCodes` union. Fill `ScrapeError` with **all** existing `SCRAPE_*` values
   (Appendix A) — the spec elides them with `/* … */`.
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
   enum keys. Fill an `ErrorEntry` for **every** `ErrorCodes` member (incl. `CrawlError.DENIAL`) and
   a `WarningEntry` for every `WarningCodes` member — the `Record<…>` type makes a miss a compile
   error.
2. Use the §5 status table for `httpStatus`. Write a real `explanation` + `fix` per code (this is the
   user-facing transparency text; the playground renders it).
3. Export `errorCodeToHttpStatus`, `explainError`, `explainWarning`.

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

## WP4 — Envelope: `code` required + `errorId?` + `warnings?` fields (goes RED on purpose)

**Goal:** flip the v2 envelope to the target shape. This makes every error-construction site that
lacks a `code` a compile error — that's the forcing function; WP5 resolves it.

**Spec:** §4. Depends on WP2, WP3.

Steps:

1. `controllers/v2/types.ts`: `ErrorResponse.code` → **required** `ErrorCodes`; add `errorId?:
string`, `details?: ErrorDetails`, `diagnostics?: Diagnostics` (define `Diagnostics` minimally or
   import from RESPONSE-MODEL work — see Open deps). Add `warnings?: WarningEntry[]` to each v2
   success/partial response type. `warning?: string` stays.
2. Do **not** touch `controllers/v1/types.ts` envelope (v1 out of scope; its comparison sites were
   already fixed in WP1).

**Verify:** `pnpm exec tsc --noEmit` now reports errors at every v2 error return missing `code` —
expected. Capture the list (`tsc` output) as the WP5 worklist. **End state: RED (intended).**

---

## WP5 — Assign codes + status normalization (drives back to GREEN)

**Goal:** give every v2 error return a `code`, and route status through `errorCodeToHttpStatus`.

**Spec:** §5, §6. Depends on WP4. This is the largest WP — split by controller across agents.

Surface (verified): **~191 `res.status().json()` sites in v2 controllers** (mix of success/error;
the error subset needs codes), the **3 `TransportableError` status ladders** (`scrape.ts:397`,
`parse.ts:606`, `v1:259`), and **~6 middleware gates** (auth/credits/rate/blocklist/country/
idempotency in `routes/shared.ts` + `controllers/auth.ts`).

Steps (per controller / middleware):

1. For each error return, pick the right `ErrorCodes` member (use Appendix A categories; add a new
   enum member + catalog entry if none fits — e.g. `monitor.ts` "Monitor not found" →
   `LifecycleError.JOB_NOT_FOUND` or a new `MonitorError` if you'd rather — decide and stay
   consistent). Attach `details` where the §4a map defines a shape.
2. Replace hardcoded `res.status(N)` with `res.status(errorCodeToHttpStatus(code))` for error
   returns. Leave success `res.status(200)` alone.
3. Collapse the 3 `TransportableError` ladders to `errorCodeToHttpStatus(e.code)`.
4. Middleware: emit the new auth/billing/rate/gating codes + `details` (§7) instead of bare strings.

**Verify:** `pnpm exec tsc --noEmit` clean again; run the v2 snips for each touched controller.
**End state: GREEN.**

---

## WP6 — Structured warnings (ends GREEN; parallelizable after WP1/WP3)

**Goal:** every v2 success/partial response can carry `warnings[]`; the 16 producers push typed
entries; `warning` string preserved.

**Spec:** §3, §4 (warnings), §8. **Edit list:** Appendix C. Depends on WP1 (warning enums) + WP3
(`WarningDetails`). Coordinate the response-type field addition with WP4.

Steps:

1. At each of the 16 producers (Appendix C): keep the existing `document.warning = …` assignment
   **and** push `{ code: <WarningEnum>, message: <same text>, details? }` onto the response's
   warnings array. For scrape-pipeline producers, accumulate on the `Document` (rides the job
   result); for `crawl-status.ts` build inline in the controller.
2. In each v2 response builder, surface the collected `warnings[]` (lift from the Document for
   scrape; inline for search/map/crawl/agent). No shared collector class.

**Verify:** snips assert `warnings[]` entries **and** the legacy `warning` string still contains the
verbatim text (§10). **End state: GREEN.**

---

## WP7 — `errorId` scoped to the opaque path

**Goal:** `errorId` only on `CommonError.UNKNOWN` / uncaught / Sentry-captured errors; typed errors
carry none; improve the opaque message.

**Spec:** §4 (errorId semantics). Depends on WP5.

Steps:

1. Add a small helper (NOT in `getErrorContactMessage`) used only on the opaque path: capture →
   obtain id (`res.sentry` in the global handler; the `captureExceptionWithZdrCheck` return id at
   controller catches) → return `{ errorId? , message }`. Set `errorId` only when an id genuinely
   exists (Sentry) or fall back to the logged uuid for self-host log-grep.
2. Ensure typed-error returns (WP5) do **not** set `errorId`.
3. Improve the opaque `error` message to carry safe context beyond "check your logs" where possible.
4. `getErrorContactMessage` stays a pure formatter — no logging added.

**Verify:** snip — typed error has no `errorId`; forced unexpected error has one only with Sentry
configured. **End state: GREEN.**

---

## WP8 — Tests + guards

**Spec:** §10. Depends on all.

Steps:

1. Two completeness unit tests: `ERROR_CATALOG` over `ErrorCodes`, `WARNING_CATALOG` over
   `WarningCodes` (with a `@ts-expect-error` guard test and an `httpStatus` sanity assert).
2. Failure-path snips per group (auth 401, billing 402, rate 429, lifecycle 404, engines 502,
   dependency 502/503, local 422) asserting `code` (enum value) + status.
3. Warning snips (media/extract/crawl) asserting structured `warnings[]` + verbatim `warning`.
4. A magic-string guard: a unit test / CI grep asserting no `\.code === "[A-Z_]+"` remains in
   `controllers/` and `scraper/`.
5. Gating: fire-engine cases behind `!process.env.TEST_SUITE_SELF_HOSTED`; AI behind
   `!process.env.TEST_SUITE_SELF_HOSTED || OPENAI_API_KEY || OLLAMA_BASE_URL`; `scrapeTimeout` from
   `./lib`.

---

## Open deps to resolve before WP4

- **`Diagnostics`** type is referenced by the envelope but defined in the RESPONSE-MODEL work. For
  WP4, either import it from there or stub `type Diagnostics = Record<string, unknown>` and tighten
  later. Ask the owner if unsure.
- **New codes with no thrower yet** (most of auth/billing/rate/gating/lifecycle/dependency) are fine
  to define; they get wired in WP5. Knip won't complain because each is consumed by its catalog
  entry.

---

## Appendix A — existing code → enum member (all current codes)

| current `ErrorCodes` value             | enum member                                    |
| -------------------------------------- | ---------------------------------------------- |
| `SCRAPE_TIMEOUT`                       | `ScrapeError.TIMEOUT`                          |
| `MAP_TIMEOUT`                          | `MapError.TIMEOUT`                             |
| `UNKNOWN_ERROR`                        | `CommonError.UNKNOWN`                          |
| `SCRAPE_ALL_ENGINES_FAILED`            | `ScrapeError.ALL_ENGINES_FAILED`               |
| `SCRAPE_SSL_ERROR`                     | `ScrapeError.SSL`                              |
| `SCRAPE_SITE_ERROR`                    | `ScrapeError.SITE`                             |
| `SCRAPE_PROXY_SELECTION_ERROR`         | `ScrapeError.PROXY_SELECTION`                  |
| `SCRAPE_PDF_PREFETCH_FAILED`           | `ScrapeError.PDF_PREFETCH_FAILED`              |
| `SCRAPE_DOCUMENT_PREFETCH_FAILED`      | `ScrapeError.DOCUMENT_PREFETCH_FAILED`         |
| `SCRAPE_JOB_CANCELLED`                 | `ScrapeError.JOB_CANCELLED`                    |
| `SCRAPE_RETRY_LIMIT`                   | `ScrapeError.RETRY_LIMIT`                      |
| `SCRAPE_ZDR_VIOLATION_ERROR`           | `ScrapeError.ZDR_VIOLATION`                    |
| `SCRAPE_DNS_RESOLUTION_ERROR`          | `ScrapeError.DNS`                              |
| `SCRAPE_PDF_INSUFFICIENT_TIME_ERROR`   | `ScrapeError.PDF_INSUFFICIENT_TIME`            |
| `SCRAPE_PDF_ANTIBOT_ERROR`             | `ScrapeError.PDF_ANTIBOT`                      |
| `SCRAPE_PDF_OCR_REQUIRED`              | `ScrapeError.PDF_OCR_REQUIRED`                 |
| `SCRAPE_DOCUMENT_ANTIBOT_ERROR`        | `ScrapeError.DOCUMENT_ANTIBOT`                 |
| `SCRAPE_UNSUPPORTED_FILE_ERROR`        | `ScrapeError.UNSUPPORTED_FILE`                 |
| `SCRAPE_ACTION_ERROR`                  | `ScrapeError.ACTION`                           |
| `SCRAPE_RACED_REDIRECT_ERROR`          | `ScrapeError.RACED_REDIRECT`                   |
| `SCRAPE_NO_CACHED_DATA`                | `ScrapeError.NO_CACHED_DATA`                   |
| `SCRAPE_LOCKDOWN_CACHE_MISS`           | `ScrapeError.LOCKDOWN_CACHE_MISS`              |
| `SCRAPE_SITEMAP_ERROR`                 | `ScrapeError.SITEMAP`                          |
| `SCRAPE_ACTIONS_NOT_SUPPORTED`         | `ScrapeError.ACTIONS_NOT_SUPPORTED`            |
| `SCRAPE_BRANDING_NOT_SUPPORTED`        | `ScrapeError.BRANDING_NOT_SUPPORTED`           |
| `SCRAPE_AUDIO_UNSUPPORTED_URL`         | `ScrapeError.AUDIO_UNSUPPORTED_URL`            |
| `SCRAPE_VIDEO_UNSUPPORTED_URL`         | `ScrapeError.VIDEO_UNSUPPORTED_URL`            |
| `SCRAPE_X_TWITTER_CONFIGURATION_ERROR` | `ScrapeError.X_TWITTER_CONFIGURATION`          |
| `AGENT_INDEX_ONLY`                     | `AgentError.INDEX_ONLY`                        |
| `MAP_FAILED`                           | `MapError.FAILED`                              |
| `CRAWL_DENIAL`                         | `CrawlError.DENIAL` **(new enum — add to §2)** |
| `PARSE_UNSUPPORTED_OPTIONS`            | `RequestError.PARSE_UNSUPPORTED_OPTIONS`       |
| `BAD_REQUEST`                          | `RequestError.BAD_REQUEST`                     |
| `BAD_REQUEST_INVALID_JSON`             | `RequestError.BAD_REQUEST_INVALID_JSON`        |

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

## Appendix C — the 16 warning producers (WP6 edit list)

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
