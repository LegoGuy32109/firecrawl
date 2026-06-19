# Playground Implementation Plan

Derived from SPEC-PLAYGROUND-UI.md, SPEC-CDP-ENGINE.md, SPEC-LIVE-SESSION.md.
Interview-confirmed decisions recorded here.

---

## Decisions

| #              | Question                       | Decision                                                                     |
| -------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| Scope          | Phase 2 + Phase 3 + CDP engine | All three, phased across PRs                                                 |
| Test location  | Admin route tests              | `src/admin/__tests__/` via `pnpm harness vitest` (Option C — full harness)   |
| Auth in tests  | BULL_AUTH_KEY source           | `config.BULL_AUTH_KEY` directly                                              |
| Bundle build   | esbuild wiring                 | Add `build:playground` script, emit `dist/playground.bundle.js`              |
| Boot check     | Missing bundle                 | Harness crash with descriptive message at startup                            |
| Error coverage | Catalog test sufficiency       | Existing `error-catalog/catalog.test.ts` + `browser.test.ts` are sufficient  |
| Phase ordering | PR sequence                    | PR1 → PR2 → PR3 (PR1+PR2 independent; PR3 depends on both)                   |
| Client code    | Scope                          | Full Preact client is in scope; detail in separate SPEC-PLAYGROUND-CLIENT.md |

---

## Current State (as of 2026-06-17)

### Already done

- `playwright-service-ts/api.ts` — `POST /browsers`, `DELETE /browsers/:id`, `GET /browsers/:id/view`, `POST /browsers/:id/exec` all implemented with full session lifecycle
- `scraper/scrapeURL/engines/playwright/cdp.ts` — `scrapeURLWithPlaywrightCDP` handler implemented (actions, screenshots, mobile, location)
- `engines/index.ts` — `playwright;cdp` in Engine union, handlers, feature flags
- `src/__tests__/snips/v2/scrape-playwright-cdp.test.ts` — test file exists, gated on `HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE`
- `lib/browser-sessions.ts` — full session CRUD (local Map + DB-backed)
- `lib/scrape-interact/browser-service-client.ts` — HTTP client for 3-endpoint contract
- `lib/__tests__/error-catalog/browser.test.ts` — browser-safety CI guard for error-catalog modules
- `lib/__tests__/error-catalog/catalog.test.ts` — catalog completeness + `errorCodeToHttpStatus` parity

### Not yet built

- Playground route/controller
- Preact client source (`src/admin/playground/client/`)
- esbuild build step
- Session admin routes under `/admin/${BULL_AUTH_KEY}/playground/session*`
- WS proxy generalization (`sessionLivecastWS`)

---

## PR 1 — CDP Engine Verification

**Goal:** confirm existing engine code passes its own tests; no new features expected.

**Work:**

1. Run `pnpm harness vitest src/__tests__/snips/v2/scrape-playwright-cdp.test.ts` and fix any failures
2. Audit `engines/playwright/cdp.ts` feature flags vs SPEC-CDP-ENGINE §2 capability table
3. Confirm `location`/`mobile` (Phase E3, deferred) produce `LocalError.FEATURE_UNSUPPORTED` with `details.requiresEngine:"fire-engine"` rather than silently passing
4. Confirm `playwright-service-ts` screencast (`GET /browsers/:id/view`) contract is correct for Phase 3 live-view

**Tests:** `src/__tests__/snips/v2/scrape-playwright-cdp.test.ts` — gated `HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE`

---

## PR 2 — Phase 2 Playground UI

### New files

```
src/admin/playground/controller.ts          Express handler; reads bundle at module load
src/admin/playground/client/index.tsx       Preact app entry point
src/admin/playground/client/signals.ts      All signals (apiKey, activeFeature, requestBody, response, inflight, ...)
src/admin/playground/client/components/
  Header.tsx                                env, base URL, optional API key field
  FeatureNav.tsx                            sets activeFeature signal
  RequestBuilder.tsx                        form ↔ rawJson; emits onSend(body)
  ResponsePane.tsx                          status pill + timing + success/error router
  StatusPill.tsx                            http status + errorCodeToHttpStatus parity check
  SuccessView.tsx                           data view for successful responses
  ErrorView.tsx                             code → explainError, errorId, details, diagnostics
  WarningList.tsx                           warnings[] via explainWarning, legacy string fallback
  DiagnosticsWaterfall.tsx                  steps: engine waterfall / per-source / per-action
src/admin/__tests__/playground.test.ts      Route tests (harness pattern)
```

### Edited files

```
package.json                                Add build:playground esbuild script
src/harness.ts                              Boot assertion: crash with message if bundle missing
src/routes/admin.ts                         Register GET /admin/${BULL_AUTH_KEY}/playground
src/admin/admin-index.ts                    Add playground row to keyedRoutes
```

### Build script

```json
"build:playground": "esbuild src/admin/playground/client/index.tsx --bundle --platform=browser --jsx=automatic --jsx-import-source=preact --format=iife --minify --outfile=dist/playground.bundle.js"
```

### New deps (apps/api/package.json)

- `preact`
- `@preact/signals`

### Harness boot check

After server starts, if bundle string is empty (file missing or zero bytes):

```
Error: Playground bundle not found at dist/playground.bundle.js
Run `pnpm build:playground` then restart.
```

### Tests (src/admin/**tests**/playground.test.ts)

```
GET /admin/${BULL_AUTH_KEY}/playground        → 200
Response body contains non-empty <script>     → bundle inlined
GET /admin/wrong-key/playground              → 404
Response contains expected feature nav HTML   → structure sanity
```

### Spec coverage

SPEC-PLAYGROUND-UI §1–7, §9 Phase 2

---

## PR 3 — Phase 3: Live Session Routes + UI Additions

**Depends on:** PR 1 (browser service contract verified) + PR 2 (bundle infrastructure)

### New files

```
src/admin/playground/session.ts             Session admin controller
src/services/sessionLivecastWS.ts           Parameterized WS bridge (generalizes agentLivecastWS)
src/admin/playground/client/components/
  LiveView.tsx                              <canvas> + WS frame consumer
  RecorderPanel.tsx                         Action list, edit, export (curl + SDK snippet)
src/admin/__tests__/playground-session.test.ts  Session route tests
```

### Edited files

```
src/routes/admin.ts                         Add session routes (POST/DELETE/WS)
src/admin/admin-index.ts                    Update playground entry if needed
```

### Session routes

```
POST   /admin/${BULL_AUTH_KEY}/playground/session           createPlaygroundSession
DELETE /admin/${BULL_AUTH_KEY}/playground/session/:id       deletePlaygroundSession
WS     /admin/${BULL_AUTH_KEY}/playground/session/:id/view  sessionLivecastWS proxy
```

### WS proxy refactor

`agentLivecastWS` hardcodes target URL. Refactor to `createLivecastWS(getTargetUrl: (req) => string)` factory
used by both the existing agent livecast and the new session livecast routes.

### Tests (src/admin/**tests**/playground-session.test.ts, gated HAS_PLAYWRIGHT)

```
POST session                                → 200, returns sessionId + liveViewUrl
DELETE session/:id                          → 200, returns durationMs + artifact URLs
DELETE unknown session id                   → appropriate error
```

### Spec coverage

SPEC-PLAYGROUND-UI §7–8, §9 Phase 3; SPEC-LIVE-SESSION §3

---

## Dependency Graph

```
PR1 (verify CDP engine)  ─────────────────────────────┐
                                                       ▼
PR2 (Phase 2 UI + bundle infra)  ────────────────► PR3 (Phase 3 session + UI)
```

PR1 and PR2 are independent and can be developed in parallel branches.
