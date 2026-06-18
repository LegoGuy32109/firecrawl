# PR Plan — Phase 1 & 2

Date: 2026-06-17  
Branch: `improve-admin-dashboard` → single upstream PR  
Stretch goal: [STRETCH-GOAL-PR-LIVE-RECORDER.md](./STRETCH-GOAL-PR-LIVE-RECORDER.md)

---

## Context

PR1 (CDP engine), PR2 (Phase 2 UI), and PR3 (Phase 3 session routes) from the original
PLAYGROUND-IMPL-PLAN.md are already merged into this branch. The plan below covers what
remains to make the playground correct, secure, and demo-ready for the velvet-comet
submission.

**Demo scenarios that must work:**

1. Scrape a URL → structured error with code, explanation, and diagnostics waterfall
2. Scrape a URL → success with warnings rendered in the warning list
3. Submit an action sequence → per-action results in the diagnostics waterfall

**Organization:** three local groupings (A, B, C) shipped as one upstream PR when Phase 2
is complete. The A/B/C split is for reviewability and git bisectability, not separate PRs.

---

## PR A — Security & Boundary Corrections

**Goal:** remove accidentally-public routes added on this branch, fix knip, and ensure
the playground bundle is present before tests run.

**Ship order:** do this first. PR B and C depend on a clean security baseline.

### Files changed

#### Remove public `/v2/live/*` routes

`apps/api/src/routes/v2.ts`

Delete these four route blocks:

- `GET /v2/live/browser/:sessionId/view`
- `GET /v2/live/browser/:sessionId/artifacts/:name`
- `GET /v2/live/scrape/:scrapeId/artifacts/:name`
- `WS  /v2/live/browser/:sessionId/ws`

Delete the helpers that become unused after removal:

- `proxyTextResponse`
- `proxyBinaryResponse`
- `browserServiceWsUrl`
- `WSWebSocket` import if it has no remaining callers

`apps/api/src/lib/live.ts`

Replace the `/v2/live/...` path builders with admin-scoped equivalents per
PLAYGROUND-COURSE-CORRECTIONS Step 1:

```ts
export function adminBrowserLiveViewPath(
  basePath: string,
  sessionId: string,
): string {
  return `${basePath}/session/${encodeURIComponent(sessionId)}/view`;
}
export function adminBrowserLiveArtifactPath(
  basePath: string,
  sessionId: string,
  name: string,
): string {
  return `${basePath}/session/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(name)}`;
}
```

Remove `browserLiveViewPath`, `browserLiveWsPath`, `browserLiveArtifactPath` (they emit
dead `/v2/live/...` URLs).

`apps/api/src/controllers/v2/browser.ts`

Strip `liveViewUrl`, `interactiveLiveViewUrl`, and the `live` field from all public
response shapes and all `r.ok()` / `r.warn()` call sites. These were added on this
branch for playground purposes and are not part of the upstream public API.

Also remove import of `browserLiveViewPath` / `buildBrowserLive` if they become unused.

#### Remove `__playgroundLive` from public schema

`apps/api/src/controllers/v2/types.ts`

- Remove `browserLiveScrapeOptions` (the schema extension that adds `__playgroundLive`)
- Make `scrapeRequestSchemaBase` and `batchScrapeRequestSchemaBase` extend
  `baseScrapeOptions` directly
- Remove every reference to `browserLiveScrapeOptions`

If internal playground-live behavior is still needed (Phase 3 live view), use
`req.playground?.live` via Express namespace augmentation (defined in
PLAYGROUND-COURSE-CORRECTIONS Step 2) — not a public schema field.

#### Knip fixes

`apps/api/package.json` — add knip ignore for `getPlaygroundSession`:

```json
"knip": {
  "ignoreDependencies": [],
  "ignoreExports": ["getPlaygroundSession"]
}
```

Or wire `getPlaygroundSession` to an actual caller if one was intended (check whether
the admin session status route needs it).

Replace `@uiw/react-json-view` with an inline JSON renderer:

- `src/admin/playground/client/components/JsonView.tsx` — replace the `@uiw/react-json-view`
  import with a local syntax-highlighted `<pre>` renderer (JSON.stringify + token coloring)
- `src/admin/playground/client/components/JsonEditor.tsx` — same replacement
- Remove `@uiw/react-json-view` from `apps/api/package.json` dependencies

#### Harness pre-build step

`apps/api/package.json` — add `preharness` script so the playground bundle is always
built before any harness invocation:

```json
"preharness": "pnpm build:playground"
```

esbuild is fast (~200ms), so this doesn't meaningfully slow down test runs.

### Tests (PR A)

New file: `apps/api/src/__tests__/snips/v2/live-routes.test.ts`

```
GET /v2/live/browser/test/view → 404
GET /v2/live/browser/test/artifacts/final.jpeg → 404
GET /v2/live/scrape/test/artifacts/final.jpeg → 404
```

New file: `apps/api/src/__tests__/snips/v2/scrape-playground-live-guard.test.ts`

```
POST /v2/scrape with __playgroundLive: true → 400 (strict schema rejects unknown field)
```

Extend `apps/api/src/admin/__tests__/playground.test.ts`:

```
HTML includes non-empty <script> tag          → bundle is inlined
GET /admin/wrong-key/playground               → 404 (already exists, keep)
GET /admin/${key}/playground                  → 200 (already exists, keep)
```

### Win conditions (PR A)

- `pnpm knip` passes
- `pnpm exec tsc --noEmit` stays green
- `pnpm harness vitest run src/__tests__/snips/v2/live-routes.test.ts` passes
- `pnpm harness vitest run src/__tests__/snips/v2/scrape-playground-live-guard.test.ts` passes
- `pnpm harness vitest run src/admin/__tests__/playground.test.ts` passes

---

## PR B — RC Tasks 1–5 + Diagnostics Wiring

**Goal:** fix the error catalog, wire the per-action diagnostics that the demo needs,
and mount privacy middleware so the response envelope flows correctly.

Split into two sub-groups for reviewability:

### B1: Catalog corrections + new codes + r.step wiring

#### Task 1: Catalog status corrections (`lib/error-catalog.ts`)

- `LifecycleError.ZDR_NOT_SUPPORTED`: 400 → 422
- `MapError.FAILED`: 502 → 500

#### Task 2: New agent-interop code

- Add `AuthError.INTEROP_FORBIDDEN = "INTEROP_FORBIDDEN"` to `lib/error-codes.ts`
- Add its `ERROR_CATALOG` entry → 403, no `details` shape
- In `search.ts` AND `batch-scrape.ts`: both agent-interop rejections use
  `r.fail(AuthError.INTEROP_FORBIDDEN, …)` → both 403

#### Task 3: `browser.ts` exec split

Mirror the pattern from `scrape-browser.ts`:

- catch blocks around browser-service request → `r.fail(BrowserError.SERVICE_UNAVAILABLE, …, { details: { dependency: "browser-service" } })` → 503
- `exitCode !== 0 || killed` → `r.fail(BrowserError.EXECUTION_FAILED, stderr || "Execution failed", { details: { exitCode, killed } })` → 422

#### r.step wiring for demo scenarios

The DiagnosticsWaterfall component is fully built but has no data source — no controller
currently calls `r.step()`. This must be fixed for the demo.

`apps/api/src/controllers/v2/scrape.ts` (or wherever the scrape engine waterfall executes):

- Emit one `r.step()` per engine attempt: `{ name: engineName, status: DiagnosticStatus.Ok|Failed|Skipped }`
- On fallthrough, emit why the engine was skipped / failed

`apps/api/src/lib/scrape-interact/` (interact pipeline):

- Emit one `r.step()` per action in the sequence: `{ name: action.type, status, details: action-specific }`
- This is the Customer #7 demo: 14-step sequences with per-action results visible

Research where in the scrape pipeline `r.step()` can be called. The responder's
`step()` method accumulates into `diagnostics.steps`; `makeResponder` must be in scope.
If it's not (e.g. the engine lives deep in a lib), thread a `step` callback parameter.

### B2: Task 4 — Mount privacy middleware

`apps/api/src/routes/v2.ts`

Mount the three middleware functions (defined but not yet mounted in
`controllers/v2/resolve-privacy.ts`) after `authMiddleware` and before `wrap(controller)`
on every route, classified as:

- `resolveScrapePrivacy`: scrape, parse, batch-scrape, crawl, map, extract, agent, browser execute
- `resolveSearchPrivacy`: search, x402-search, admin f-search
- `resolveContentFreePrivacy`: all other v2 routes that don't process content

See RC-COMPLETION-HANDOFF Task 4 for the full route classification list. Apply the
principle to any unlisted route. WS routes do not get middleware.

### Tests (PR B)

Extend `apps/api/src/lib/__tests__/error-catalog/catalog.test.ts`:

- `INTEROP_FORBIDDEN` entry exists and maps to 403
- `ZDR_NOT_SUPPORTED` maps to 422
- `MAP_FAILED` maps to 500

New snips for agent-interop (gate `!TEST_SUITE_SELF_HOSTED`):

- `POST /v2/search` with invalid agent interop → 403 + `AuthError.INTEROP_FORBIDDEN`
- `POST /v2/batch/scrape` with invalid agent interop → 403 + same code

Diagnostics waterfall snip (gate `!TEST_SUITE_SELF_HOSTED`):

- `POST /v2/scrape` on a URL that triggers engine fallthrough → response has
  `diagnostics.steps` array with at least one entry

### Win conditions (PR B)

- `pnpm knip` still passes
- `pnpm exec tsc --noEmit` stays green
- Catalog tests pass
- At least one snip shows a non-empty `diagnostics.steps` in the response
- Privacy middleware mounted without test regressions

---

## PR C — RC Tasks 6–8 + Diagnostics Polish

**Goal:** finish the TypeScript migration, add the regression guard, and polish the
playground rendering so all three demo scenarios look good.

### Task 5: Migrate stragglers

`routes/shared.ts` — middleware guards (auth, credits, rate, blocklist, country,
idempotency) still call `errorResponse(...)`. Convert to `makeResponder(req, res).fail(…)`.

`controllers/v2/crawl-status-ws.ts` — still uses `errorResponse`. Build the error body
via the catalog (`errorCodeToHttpStatus` / `explainError`) and send over the socket.
`makeResponder` does not apply to WS sends.

After these: remove the now-unused `httpStatus` option from `errorResponse` /
`asyncJobFailureResponse` in `response-enveloper.ts` if no caller still passes it.

### Task 6: Success types extend `ResponseCore` (intentional red → green)

In `controllers/v2/types.ts`, make every `success: true` client-facing response type
`& ResponseCore` so `status` and `diagnostics` are required.

This goes red where success paths don't yet flow through `r.ok`/`r.warn`/`r.processing`.
Fix each red site by routing it through the responder. End green.

### Task 7: Enum conversion

Convert `ResponseStatus`, `JobState`, and `DiagnosticStatus` from string unions to enums
(wire values unchanged). Update all literal sites to enum members.

### Task 8: Tests

RE guard: extend `__tests__/guards/errorcodes-regression.test.ts` to flag raw
`res.json(...)`, `res.status(...).json(...)`, `res.send(<body>)` in `controllers/v2/` +
`routes/shared.ts`, except inside `response-enveloper.ts` and lines marked
`// raw-response: <reason>`.

RB unit tests: add `makeResponder` tests from SPEC-RESPONDER-IMPL.md §"RB — test skeleton":

- catalog-derived status
- safe pre-auth default privacy
- reduced-mode stripping
- `warn` status
- step accumulation
- `r.processing` → `status:"processing"`

Feedback snips: `PREVIEW_UNAVAILABLE` 403, `JOB_NOT_SUCCESSFUL` 409, `WINDOW_EXPIRED` 410.

### Diagnostics rendering polish

With `r.step()` now emitting real data (wired in PR B), verify the playground UI renders
each scenario cleanly:

- Engine waterfall: DiagnosticsWaterfall shows each engine attempt with status badge
- Per-action results: interact actions each have a step row with action type + status
- Warning list: WarningList renders `WarningCodes` entries with `explainWarning()` text
- Error view: details block renders structurally for `INSUFFICIENT_CREDITS`, `RATE_LIMIT_EXCEEDED`,
  `FEATURE_UNSUPPORTED_LOCALLY`

Run `pnpm build:playground` and manually verify all three demo scenarios in the browser.

### Win conditions (PR C)

- `pnpm knip` passes
- `pnpm exec tsc --noEmit` green
- RE guard test passes with no allowlist entries needed for new code
- All three demo scenarios produce non-empty `diagnostics.steps` and render correctly
- `LegacyErrorResponse` can be removed (or has zero callers) by the end of this group

---

## Dependency graph

```
PR A (security + knip + preharness)
  │
  ▼
PR B1 (catalog corrections + r.step wiring)
  │
  ▼
PR B2 (privacy middleware — high blast radius, separate commit)
  │
  ▼
PR C (RC tasks 6–8 + diagnostics polish)
  │
  ▼
One-pager (written from working demo)
```

---

## Knip-clean commit invariant

Per CLAUDE.md: never bypass knip. After PR A, knip must pass on every subsequent commit.
PR B's `INTEROP_FORBIDDEN` addition must have its catalog entry and controller usage in
the same commit. Task 4 (privacy middleware) fixes any lingering unused-export warnings
from resolve-privacy.ts.

---

## What this deliberately excludes

- `/scrape-cdp` endpoint split in playwright-service — deferred to stretch goal
- Browser service TTL cleanup and artifact retention — deferred to stretch goal
- `getActiveBrowserSession` helpers — deferred to stretch goal
- Recorder wiring (actual browser interaction recording) — deferred to stretch goal
- SDK / OpenAPI type sync (WP10) — out of scope for this PR
- Search reranking, deduplication, custom proxies — different product surface entirely
  </content>
  </invoke>
