# RC Completion — Handoff Brief

Self-contained brief to **finish RC** of [SPEC-RESPONDER-IMPL.md](./SPEC-RESPONDER-IMPL.md). The
foundation and all controller migrations are already done and `tsc --noEmit` is **green**. This
covers only what remains, plus the locked behavior-change decisions. Read SPEC-RESPONDER-IMPL.md for
full design context. All paths relative to `apps/api/src/`.

## Already done (do not redo)

- **`makeResponder(req, res)`** exists in `controllers/v2/response-enveloper.ts` → `{ step, ok, warn,
processing, fail, asyncFail }`. Send-style (it calls `res.status().json()` and returns the
  Response). Owns a mutable `diagnostics` read from `req.privacy`; applies `reduced` automatically.
  - `r.fail(code, msg, { details?, errorId?, sponsor_status?, login_url? })` — HTTP status is ALWAYS
    `errorCodeToHttpStatus(code)`; there is no status override.
  - `r.ok(body)` / `r.warn(body, warnings)` / `r.processing(body)` (in-flight async →
    `status:"processing"`) / `r.asyncFail(code, msg, { data?, failureCount?, failuresByCode?, ... })`.
- **All 28 v2 controllers migrated** to `makeResponder`. Zero `httpStatus:` overrides remain in
  controllers. Async-status controllers use `r.processing` for in-flight jobs.
- **RA** privacy plumbing exists: `RequestPrivacy`/`PrivacyMode` + `Request.privacy` augmentation in
  `types.ts`; `getPrivacyMode` in `lib/zdr-helpers.ts`; the three middlewares
  (`resolveScrapePrivacy`/`resolveSearchPrivacy`/`resolveContentFreePrivacy`) in
  `controllers/v2/resolve-privacy.ts` — **defined but NOT yet mounted**.
- **RD** feedback codes + **RF** serde/rename done. Catalog `EXECUTION_FAILED` already set to 422.

## Constraints

- Keep `tsc --noEmit` (from `apps/api`) green after each task **except** task 6 (success-type
  extension) which is an intentional red you must drive back to green in the same pass.
- Never bypass `knip`. `resolve-privacy.ts` exports + `getPrivacyMode` are currently unused and will
  fail knip — task 4 (mounting) fixes that. Do not commit until knip is clean.
- Run snips with `pnpm harness jest <path>`, never `pnpm start`. Gate fire-engine cases behind
  `!process.env.TEST_SUITE_SELF_HOSTED`, AI behind `… || OPENAI_API_KEY || OLLAMA_BASE_URL`; use
  `scrapeTimeout` from `./lib`.

---

## Tasks

### 1. Catalog status corrections (`lib/error-catalog.ts`)

- `LifecycleError.ZDR_NOT_SUPPORTED`: **400 → 422** (decision A). All ZDR-not-supported rejections
  unify to 422 ("understood, unprocessable for your retention config"). This is correct even though
  pre-refactor some endpoints returned 400 and others 403.
- `MapError.FAILED`: **502 → 500** (decision D). A map failure is our-side aggregation, not a single
  upstream gateway.

### 2. New agent-interop code (decision B)

Pre-refactor, "Invalid agent interop." / "Agent interop is not enabled." returned **403** on both
`search.ts` and `batch-scrape.ts`. The migration split them inconsistently (search → 400, batch →
401). Fix:

- Add `AuthError.INTEROP_FORBIDDEN = "INTEROP_FORBIDDEN"` to `lib/error-codes.ts`.
- Add its `ERROR_CATALOG` entry → **403**, no `details` (Record completeness requires it).
- In `search.ts` AND `batch-scrape.ts`, the two agent-interop rejections (invalid / not-enabled) use
  `r.fail(AuthError.INTEROP_FORBIDDEN, …)`. Both controllers must use the same code → both 403,
  restoring pre-refactor behavior and removing the inconsistency.

### 3. browser.ts exec split (decision E)

`browser.ts` has the same two failure modes as interact, but the migration mapped both to one code.
Split them (mirror `scrape-browser.ts`):

- Browser **service call threw** (the catch blocks around the browser-service request / exec) →
  `r.fail(BrowserError.SERVICE_UNAVAILABLE, msg, { details: { dependency: "browser-service" } })`
  → 503. These are upstream/dependency failures (pre-refactor 502).
- User **code ran but failed** (`exitCode !== 0 || killed`) →
  `r.fail(BrowserError.EXECUTION_FAILED, stderr || "Execution failed", { details: { exitCode, killed } })`
  → 422. Add a `// CHANGED:` comment if it was previously a 200/`success:false` body.

The two causes are genuinely different (service-down vs command-failed) and must carry different
codes/statuses. (`scrape-browser.ts` already does this — copy the pattern. Interact exec-threw stays
503 per decision F.)

### 4. Mount privacy middleware (`routes/v2.ts`)

Insert the matching middleware on each route **after `authMiddleware(...)` and before
`wrap(controller)`**. Classify by whether the endpoint processes/returns scrape/search content:

- **`resolveScrapePrivacy`** (content-bearing): `/parse`, `/scrape`, `/scrape/:jobId` (status),
  `/scrape/:jobId/interact` (POST), `/batch/scrape`, `/batch/scrape/:jobId` (status), `/map`,
  `/crawl`, `/crawl/:jobId` (status), `/extract`, `/extract/:jobId` (status), `/agent`,
  `/agent/:jobId` (status), and the `/v2/browser` execute endpoints.
- **`resolveSearchPrivacy`**: `/search`, `/x402/search` (x402-search), and the admin `f-search`
  route.
- **`resolveContentFreePrivacy`** (no scrape/search content): `/keyless/eligibility`, `/feedback`,
  `/search/:jobId/feedback`, `/crawl/params-preview`, `/crawl/ongoing`, `/crawl/active`,
  `/crawl/:jobId` (DELETE cancel), `/crawl/:jobId/errors`, `/batch/scrape/:jobId` (DELETE),
  `/batch/scrape/:jobId/errors`, `/scrape/:jobId/interact` (DELETE), `/agent/:jobId` (DELETE),
  token-usage, credit-usage, concurrency-check, queue-status, monitor routes, browser
  list/destroy, support-proxy, research-proxy.

Read `routes/v2.ts` and apply the principle to any route not listed. The WS route
(`/crawl/:jobId` `.ws(...)`) does not get this middleware (handled in task 5).

### 5. Migrate the stragglers

- `routes/shared.ts` middleware guards (auth/credits/rate/blocklist/country/idempotency) still call
  `errorResponse(...) + res.status().json()`. Convert to `const r = makeResponder(req, res); return
r.fail(code, …)`. Privacy defaults safely pre-auth, so no special handling.
- `controllers/v2/crawl-status-ws.ts` still uses `errorResponse`. It sends over a WebSocket, not
  `res` — `makeResponder` does not apply. Build the error body with the catalog
  (`errorCodeToHttpStatus`/`explainError`) and send it over the socket; do NOT introduce an
  `httpStatus` override. Keep its behavior, just make the code/status catalog-driven.
- After these + browser endpoints, `errorResponse`'s only remaining callers are `feedback/record.ts`
  (thin wrapper, fine) and tests. Optionally remove the now-unused `httpStatus` option from
  `errorResponse`/`asyncJobFailureResponse` in `response-enveloper.ts` (no caller passes it).

### 6. Success types extend `ResponseCore` (intentional red → green)

In `controllers/v2/types.ts`, make the `success:true` arm of every client-facing v2 response type
(`ScrapeResponse`, `SearchResponse`, `BatchScrapeResponse`, crawl/extract/agent/map/monitor/etc.)
`& ResponseCore` so `status` + `diagnostics` are required; async status types additionally carry
`jobState`. This goes red where any success path doesn't yet flow through `r.ok`/`r.warn`/
`r.processing`. Fix each red site by routing it through the responder. End green.

### 7. Enum conversion

Convert `ResponseStatus`, `JobState`, and `DiagnosticStatus` (in `types.ts`) from string unions to
**enums** (values unchanged on the wire). Update every string-literal site to the enum member —
inside `response-enveloper.ts` (the responder sets `status`/`jobState`) and any controller that
writes `jobState`/diagnostic `status` literals (e.g. `r.step({ status: DiagnosticStatus.Ok })`,
`jobState: JobState.Cancelled`). `name` on `r.step` stays a free string. This is consistent with the
`ErrorCodes` enum convention.

### 8. Tests (RE guard + RB unit)

- **RE guard:** extend the AST guard `__tests__/guards/errorcodes-regression.test.ts` to flag
  `res.json(...)`, `res.status(...).json(...)`, `res.send(<body>)` in `controllers/v2/` +
  `routes/shared.ts` EXCEPT inside `response-enveloper.ts` and lines carrying a
  `// raw-response: <reason>` marker. The genuine pass-throughs in `support-proxy.ts` /
  `research-proxy.ts` already carry that marker; WS sends are not `res.json`.
- **RB unit tests:** add the `makeResponder` tests from SPEC-RESPONDER-IMPL.md §"RB — test skeleton"
  (catalog-derived status, safe pre-auth default privacy, reduced-mode stripping, `warn` status,
  step accumulation, plus a `r.processing` → `status:"processing"` case).
- Feedback snips: `PREVIEW_UNAVAILABLE` 403, `JOB_NOT_SUCCESSFUL` 409, `WINDOW_EXPIRED` 410.

---

## Locked behavior-change decisions (apply exactly)

| #   | Case                                        | Pre-refactor                | Final                                         | Note                                |
| --- | ------------------------------------------- | --------------------------- | --------------------------------------------- | ----------------------------------- |
| A   | `ZDR_NOT_SUPPORTED`                         | 400 (3 eps) / 403 (3 eps)   | **422**                                       | unify to correct semantic           |
| B   | agent-interop invalid/not-enabled           | 403 (both)                  | **403** via new `AuthError.INTEROP_FORBIDDEN` | fix inconsistent 400/401            |
| C   | keyless insufficient credits (search)       | 429                         | **402**                                       | keep; 429 was the outlier bug       |
| D   | `MAP_FAILED`                                | 500                         | **500**                                       | revert catalog 502→500              |
| E   | browser exec: service-threw vs code-nonzero | 502 / 200                   | **503** / **422**                             | split by cause (service vs command) |
| F   | interact exec-threw                         | 502                         | **503** (`SERVICE_UNAVAILABLE`)               | keep                                |
| G   | interact exec-ran-non-zero                  | 200/`success:false`/no-code | **422** + `EXECUTION_FAILED`                  | already applied                     |

Net theme: most "changes" are RC making the catalog authoritative and thereby **fixing pre-refactor
inconsistencies** (B, C, E). A and D are deliberate catalog corrections. All HTTP statuses must come
from the catalog — never reintroduce an `httpStatus` override; dynamic upstream/origin status goes in
`details.statusCode`.
