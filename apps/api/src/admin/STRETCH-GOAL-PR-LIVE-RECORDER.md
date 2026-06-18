# Stretch Goal: Live Session Polish + Recorder Wiring

Deferred from the Phase 1/2 PR plan. Depends on Phase 2 being shipped and stable.

---

## Scope

This covers the work that makes the live view and recorder genuinely useful rather than
structurally present — the "hard parts" of Phase 3.

### PR D: Playground Live/Recorder UX (from PLAYGROUND-COURSE-CORRECTIONS §PR D)

- Wire actual recorded actions from browser interaction events into `actions` signal
  (currently the RecorderPanel edits a static list; there is no feed from the browser)
- Selector generation for recorded clicks/writes (the hard part — requires CDP injection
  or similar on the playwright-service side)
- `PLAYWRIGHT_ARTIFACT_TTL_MS` cleanup for .webm recordings
- Active-only browser session helpers (`getActiveBrowserSession`,
  `getActiveBrowserSessionByBrowserId`) in `lib/browser-sessions.ts`
- Browser service TTL cleanup and artifact retention from SPEC-LIVE-SESSION
- Best-effort `mobile` / `location` warnings via new `SCRAPE_ENGINE_PARTIAL_FEATURES`
  warning code

### /scrape-cdp Endpoint Split (PLAYGROUND-COURSE-CORRECTIONS Step 4)

- Add `POST /scrape-cdp` to `apps/playwright-service-ts/api.ts` alongside legacy `/scrape`
- `apps/api/src/scraper/scrapeURL/engines/playwright/cdp.ts` uses
  `config.PLAYWRIGHT_CDP_URL ?? config.PLAYWRIGHT_MICROSERVICE_URL`
- Update Docker compose defaults:
  - `PLAYWRIGHT_CDP_URL: ${PLAYWRIGHT_CDP_URL:-http://playwright-service:3000/scrape-cdp}`
  - `BROWSER_SERVICE_API_KEY: ${BROWSER_SERVICE_API_KEY:-local-browser-service-secret}`
- Legacy `/scrape` preserved unchanged

### Resource Lifecycle (PLAYGROUND-COURSE-CORRECTIONS Step 6–7)

- `LiveSessionRecord.expiresAt` + `cleanupTimer` in playwright-service
- `setTimeout`-based session expiry calling `finalizeBrowserSession`
- Artifact directory removed after `PLAYWRIGHT_ARTIFACT_TTL_MS` (default 15 min)
- `getActiveBrowserSession` / `getActiveBrowserSessionByBrowserId` in browser-sessions.ts
- Apply active-only helpers to admin proxy/execute paths

---

## Tests

```
apps/playwright-service-ts/__tests__/auth.test.ts
  POST /browsers without auth → 401
  POST /browsers with auth → 200
  GET /browsers/:id/view without auth → 401

apps/api/src/__tests__/snips/v2/scrape-playwright-cdp.test.ts
  legacy /scrape still accepts old request shape
  CDP engine calls /scrape-cdp when PLAYWRIGHT_CDP_URL is set
```

---

## Why Deferred

- Selector generation requires CDP injection research — not a UI problem
- `/scrape-cdp` split requires test harness changes that risk destabilizing existing snips
- Resource lifecycle is correctness-important but doesn't block demo value
- Recorder wiring depends on the split endpoint being stable first

---

## Acceptance Criteria

1. Recording a session produces actual actions from browser events, not manual entry
2. Exported curl/SDK snippet replays the recorded session correctly
3. Browser sessions and artifacts are cleaned up after TTL expires
4. `/scrape-cdp` endpoint exists in playwright-service; legacy `/scrape` unchanged
5. `getActiveBrowserSession` prevents proxy/execute on destroyed sessions
   </content>
   </invoke>
