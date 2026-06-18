# Playground Course Corrections And Implementation Plan

Date: 2026-06-17

Context: this branch is building a local/admin playground that makes the robust v2 error refactor visible and testable, while adding an upgraded Playwright/CDP local engine so self-hosted/local deployments can exercise actions, screenshots, live view, and richer diagnostics without fire-engine.

This document is now the authoritative course-correction plan. Older specs in this directory may be stale where they conflict with the executive decisions below.

---

## Executive Decisions

1. **Live/session routes are admin-only.** Remove public `/v2/live/*` routes. Playground live view, artifacts, and recorder/session routes live under `/admin/:BULL_AUTH_KEY/playground/*`.
2. **`__playgroundLive` is not public API.** Public v2 schemas should not accept it. Use admin middleware/internal metadata to request playground-only live capture.
3. **Browser service stateful endpoints require auth.** Enforce `BROWSER_SERVICE_API_KEY` on `/browsers*`, artifact endpoints, and the browser live WS.
4. **`playwright;cdp` should steal local traffic.** All local deployments with Playwright configured should prefer the new engine over legacy `playwright`. This is intentional.
5. **`mobile` and `location` are best-effort locally.** Specs that call these deferred are outdated. Keep support, but surface warnings/diagnostics if behavior is partial.
6. **Browser service sessions need service-side TTL cleanup.**
7. **Add active-only browser session lookup.** Use `getActiveBrowserSession(...)` for proxy/live/execute paths that must not operate on destroyed sessions.
8. **Artifacts are ephemeral admin preview data.** Keep process-local tmpdir storage, add cleanup, and document best-effort behavior.
9. **Split legacy `/scrape` and upgraded `/scrape-cdp`.** Preserve existing service contract at `/scrape`; send `playwright;cdp` traffic to `/scrape-cdp`.
10. **Split config by capability.** Use explicit env vars and update Docker/scripts to make local setup easy:
    - `PLAYWRIGHT_MICROSERVICE_URL` -> legacy `/scrape`
    - `PLAYWRIGHT_CDP_URL` -> upgraded `/scrape-cdp`
    - `BROWSER_SERVICE_URL` -> stateful `/browsers*`
    - `BROWSER_SERVICE_API_KEY` -> shared auth secret
11. **Add tests for the guardrails.** Current tests cover behavior, but not enough of the security and boundary contracts.
12. **Double-check current playground work for foot guns.** Known issues are listed below.

---

## Current Repo Findings To Fix

These were verified against the current branch before this plan was written.

### Public Live Routes Still Exist

File: `apps/api/src/routes/v2.ts`

Remove:

```text
GET /v2/live/browser/:sessionId/view
GET /v2/live/browser/:sessionId/artifacts/:name
GET /v2/live/scrape/:scrapeId/artifacts/:name
WS  /v2/live/browser/:sessionId/ws
```

Also update `apps/api/src/lib/live.ts`, which currently emits `/v2/live/...` paths.

### Public `__playgroundLive` Still Exists

File: `apps/api/src/controllers/v2/types.ts`

Current schema accepts:

```ts
const browserLiveScrapeOptions = baseScrapeOptions.extend({
  __playgroundLive: z.boolean().optional(),
});
```

Remove this from public scrape/batch schemas. The playground should request live behavior through an admin route/middleware that sets internal metadata.

### Browser Service Auth Is Missing Server-Side

File: `apps/playwright-service-ts/api.ts`

API-side clients already send `Authorization: Bearer ${BROWSER_SERVICE_API_KEY}` when configured, but the browser service does not validate it.

Stateful endpoints and live WS must reject missing/invalid auth when `BROWSER_SERVICE_API_KEY` is set.

### Admin WS Proxy Target Is Wrong

File: `apps/api/src/routes/admin.ts`

Current admin WS route proxies to:

```text
/browsers/:id/view
```

The browser service WS upgrade handler listens on:

```text
/browsers/:id/view/ws
```

Fix target path.

### Playground Client Expects Missing Global

File: `apps/api/src/admin/playground/client/components/LiveView.tsx`

`LiveView` declares:

```ts
declare const BULL_AUTH_KEY: string;
```

But `apps/api/src/admin/playground/controller.ts` does not inject that global. Prefer not exposing the key as a global if possible; use relative URLs from the current admin page:

```ts
new WebSocket(new URL("./session/:id/view", location.href));
```

or inject a safer `PLAYGROUND_BASE_PATH`.

### Live UI And Recorder Are Not Mounted

File: `apps/api/src/admin/playground/client/App.tsx`

`LiveView` and `RecorderPanel` exist but are not mounted. Decide whether this PR includes live controls; if yes, mount them intentionally. If not, remove/defer the components.

### Admin Session Routes Use Service Session IDs Directly

File: `apps/api/src/admin/playground/session.ts`

This is acceptable for admin-only playground simplicity, but document it. These sessions are not team-owned v2 browser sessions unless the implementation deliberately persists them.

### Browser Service `/exec` Is RCE Without Auth

File: `apps/playwright-service-ts/api.ts`

The exec path evaluates Node code with `require`, `process`, `browser`, `context`, and `page`. Auth is mandatory before this is acceptable, even for local/self-hosted.

---

## Concrete Implementation Plan

Follow this order. Each step has clear win conditions and test locations.

### Step 1: Remove Public `/v2/live/*`

Purpose: keep live/session/artifact access inside the admin playground boundary.

Implementation:

1. Delete the `/live/browser/:sessionId/view`, `/live/browser/:sessionId/artifacts/:name`, `/live/scrape/:scrapeId/artifacts/:name`, and `/live/browser/:sessionId/ws` route blocks from `apps/api/src/routes/v2.ts`.
2. Delete helper functions in `routes/v2.ts` that become unused:
   - `proxyTextResponse`
   - `proxyBinaryResponse`
   - `browserServiceWsUrl`
   - `WSWebSocket` import if only used by removed routes
3. Replace `apps/api/src/lib/live.ts` helpers so they no longer emit `/v2/live/...`.

Recommended replacement:

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

If v2 browser controllers still need `liveViewUrl`, either:

- omit live URLs from normal public v2 browser responses for now, or
- return only admin playground live URLs from admin routes, not public controllers.

Tests:

- Add `apps/api/src/__tests__/snips/v2/live-routes.test.ts`.
- Assert unauthenticated/public `/v2/live/...` paths return 404.

Commands:

```bash
pnpm harness jest src/__tests__/snips/v2/live-routes.test.ts
```

---

### Step 2: Make Playground Live Internal/Admin-Only

Purpose: prevent public callers from enabling live capture with hidden JSON fields.

Implementation:

1. Remove `browserLiveScrapeOptions` from `apps/api/src/controllers/v2/types.ts`.
2. Revert scrape and batch scrape schemas to extend `baseScrapeOptions`.
3. Add an internal type for scrape options if needed, e.g.:

```ts
type PlaygroundInternalScrapeOptions = ScrapeOptions & {
  __playgroundLive?: boolean;
};
```

4. Add admin middleware/controller logic that sets internal metadata. Preferred shape:

```ts
declare global {
  namespace Express {
    interface Request {
      playground?: {
        live?: boolean;
      };
    }
  }
}
```

5. Admin playground scrape route should set `req.playground.live = true` and call scrape internals, or invoke the browser/CDP service directly for live preview.
6. Public `/v2/scrape` should reject or ignore `__playgroundLive`. Because v2 schemas are strict, removing the field should make public requests fail as bad request.

Tests:

- Add public guard test to `apps/api/src/__tests__/snips/v2/scrape-playwright-cdp.test.ts` or a new `scrape-playground-live-guard.test.ts`.
- Assert `POST /v2/scrape` with `__playgroundLive: true` does not activate live capture. Prefer asserting strict-schema rejection.

Command:

```bash
pnpm harness jest src/__tests__/snips/v2/scrape-playground-live-guard.test.ts
```

---

### Step 3: Require Browser Service Auth

Purpose: prevent unauthenticated browser session creation, artifact reads, live WS access, and arbitrary code execution.

Implementation in `apps/playwright-service-ts/api.ts`:

1. Add helper:

```ts
function isBrowserServiceAuthorized(req: Request): boolean {
  const expected = process.env.BROWSER_SERVICE_API_KEY;
  if (!expected) return true;
  const header = req.header("authorization") ?? "";
  return header === `Bearer ${expected}`;
}
```

2. Add middleware:

```ts
function requireBrowserServiceAuth(
  req: Request,
  res: Response,
  next: Function,
) {
  if (!isBrowserServiceAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
```

3. Apply middleware to:

```text
GET /browsers/:sessionId/view
GET /browsers/:sessionId/artifacts/:name
POST /browsers
POST /browsers/:sessionId/exec
DELETE /browsers/:sessionId
GET /scrapes/:scrapeId/artifacts/:name
```

4. For WS upgrade, validate the same auth. Since browser WebSocket constructors cannot set arbitrary headers from client-side JS, the admin API proxy must authenticate to the browser service, not the browser.

Recommended WS auth approach:

- Admin browser opens WS to API admin route.
- API admin proxy opens upstream WS to browser service with `Authorization: Bearer ...`.
- Browser service rejects direct WS upgrades without valid auth.

Update `createLivecastWS` to accept upstream headers:

```ts
createLivecastWS(getTargetUrl, getHeaders?)
```

and construct:

```ts
new WSWebSocket(targetUrl, { headers: getHeaders?.(req) });
```

Tests:

- If there is no browser-service test harness, add API/admin tests that run with `BROWSER_SERVICE_API_KEY` set and prove session route still works through the API proxy.
- Add a lightweight service-level test later for direct 401 behavior.

---

### Step 4: Split `/scrape` And `/scrape-cdp`

Purpose: keep legacy Playwright service behavior stable while allowing local deployments to prefer the upgraded engine.

Implementation:

1. In `apps/playwright-service-ts/api.ts`, keep current legacy `/scrape` behavior as close as possible to pre-branch behavior.
2. Move upgraded behavior to:

```text
POST /scrape-cdp
```

This endpoint owns:

- actions
- screenshots
- full-page screenshots
- waitFor selector support
- best-effort mobile
- best-effort location
- playground live capture when invoked internally/admin-only

3. Add `PLAYWRIGHT_CDP_URL` to `apps/api/src/config.ts`.
4. Update `apps/api/src/scraper/scrapeURL/engines/playwright/cdp.ts` to call:

```ts
config.PLAYWRIGHT_CDP_URL ?? config.PLAYWRIGHT_MICROSERVICE_URL;
```

Because executive decision 4 says local deployments should use `playwright;cdp` automatically, prefer adding a default in compose/scripts rather than gating engine presence on a separate flag.

5. Keep engine ordering:

```ts
...(usePlaywright ? ["playwright;cdp", "playwright"] : [])
```

6. Define `usePlaywright` as true when either `PLAYWRIGHT_CDP_URL` or `PLAYWRIGHT_MICROSERVICE_URL` exists. The CDP handler must fail clearly if neither URL is set.

Tests:

- Update existing CDP snips to use `PLAYWRIGHT_CDP_URL`.
- Add/keep one plain scrape test proving local response uses `playwright;cdp` when configured.
- If feasible, add one direct service contract test that legacy `/scrape` still accepts old request shape.

---

### Step 5: Update Docker, Scripts, And Local Defaults

Purpose: make the desired local setup easy and explicit.

Files:

- `docker-compose.yaml`
- `docker-compose.snips.yaml`
- `apps/api/package.json`
- `apps/playwright-service-ts/README.md`

Implementation:

1. Add env defaults:

```yaml
PLAYWRIGHT_MICROSERVICE_URL: ${PLAYWRIGHT_MICROSERVICE_URL:-http://playwright-service:3000/scrape}
PLAYWRIGHT_CDP_URL: ${PLAYWRIGHT_CDP_URL:-http://playwright-service:3000/scrape-cdp}
BROWSER_SERVICE_URL: ${BROWSER_SERVICE_URL:-http://playwright-service:3000}
BROWSER_SERVICE_API_KEY: ${BROWSER_SERVICE_API_KEY:-local-browser-service-secret}
```

2. Add same `BROWSER_SERVICE_API_KEY` to the playwright-service container environment.
3. Update `test:compose:snips` and `test:snips:compose` scripts to set `PLAYWRIGHT_CDP_URL`.
4. Keep `PLAYWRIGHT_MICROSERVICE_URL` so legacy engine/service path remains available.

---

### Step 6: Add Browser Service TTL And Artifact Cleanup

Purpose: prevent leaked browser contexts and unbounded tmpdir artifacts.

Implementation in `apps/playwright-service-ts/api.ts`:

1. Extend `LiveSessionRecord`:

```ts
expiresAt: number;
cleanupTimer?: NodeJS.Timeout;
```

2. Pass TTL into `createLiveBrowserSession`.
3. Schedule cleanup:

```ts
session.cleanupTimer = setTimeout(() => {
  finalizeBrowserSession(session.sessionId).catch(...);
}, ttlMs);
```

4. Clear timer in `finalizeBrowserSession`.
5. Remove artifact directory after a retention period. Keep final artifacts available long enough for admin download:

```text
PLAYWRIGHT_ARTIFACT_TTL_MS default 15 minutes
```

6. Add config constants for:

```text
BROWSER_SESSION_DEFAULT_TTL_SECONDS
BROWSER_SESSION_MAX_TTL_SECONDS
PLAYWRIGHT_ARTIFACT_TTL_MS
```

Tests:

- Service-level test if possible.
- Otherwise admin session test can create with short TTL only if endpoint supports it safely.

---

### Step 7: Add Active-Only Browser Session Lookup

Purpose: avoid accidental use of destroyed sessions in live/proxy/execute paths.

Implementation in `apps/api/src/lib/browser-sessions.ts`:

```ts
export async function getActiveBrowserSession(id: string) {
  const session = await getBrowserSession(id);
  return session?.status === "active" ? session : null;
}
```

Also add:

```ts
export async function getActiveBrowserSessionByBrowserId(browserId: string) { ... }
```

Use active-only helpers in:

- admin playground session/proxy routes if they persist API-side sessions
- v2 browser execute/delete/live paths that require active state
- any future artifact proxy that maps API session ID to browser service ID

Do not change broad historical lookup behavior unless tests prove it is safe.

---

### Step 8: Fix Admin Playground Live UI Wiring

Purpose: make the existing playground components actually work with admin-only routes.

Implementation:

1. In `controller.ts`, inject a safe base path:

```html
<script>
  window.__FIRECRAWL_PLAYGROUND__ = {
    basePath: "/admin/${safeBullAuthKey}/playground",
  };
</script>
```

or avoid globals by using relative URLs.

2. Update `LiveView.tsx` to connect to:

```text
${basePath}/session/${sessionId}/view
```

3. Fix admin WS upstream path:

```text
/browsers/:id/view/ws
```

4. Mount `LiveView` and `RecorderPanel` in `App.tsx` only if Phase 3 live UI is in scope for this PR. If not in scope, remove/defer these components to reduce confusion.
5. If `RecorderPanel` stays, wire actual recorded actions. The current panel edits action state but does not record browser interactions.

Tests:

- Extend `apps/api/src/admin/__tests__/playground.test.ts` to assert the playground HTML includes the base path config or uses relative-safe route construction.
- Extend `playground-session.test.ts` for session route behavior.

---

### Step 9: Best-Effort `mobile` And `location` Warnings

Purpose: keep local support while making parity limitations visible.

Implementation:

1. Keep feature flags true for `mobile` and `location`.
2. Add warnings when these are used by `playwright;cdp`, for example:

```ts
{
  code: "SCRAPE_ENGINE_PARTIAL_FEATURES",
  message: "Local Playwright mobile/location emulation is best-effort and may differ from fire-engine.",
  details: {
    engine: "playwright;cdp",
    features: ["mobile", "location"]
  }
}
```

3. Ensure warnings flow into response envelope and playground warning renderer.

Tests:

- Existing mobile/location CDP tests should continue to pass.
- Add assertion that warnings or diagnostics appear when these best-effort features are requested.

---

### Step 10: Guardrail Tests

Add these tests before considering the feature complete.

#### Public V2 Boundary Tests

File: `apps/api/src/__tests__/snips/v2/live-routes.test.ts`

Cases:

```text
GET /v2/live/browser/test/view -> 404
GET /v2/live/browser/test/artifacts/final.jpeg -> 404
GET /v2/live/scrape/test/artifacts/final.jpeg -> 404
WS /v2/live/browser/test/ws -> not registered
```

#### Public Playground Flag Test

File: `apps/api/src/__tests__/snips/v2/scrape-playground-live-guard.test.ts`

Case:

```text
POST /v2/scrape with __playgroundLive:true -> bad request, no live metadata
```

#### Admin Playground Tests

File: `apps/api/src/admin/__tests__/playground.test.ts`

Cases:

```text
GET /admin/:key/playground -> 200
GET /admin/wrong-key/playground -> 404
HTML includes non-empty bundle
HTML includes base path config or relative route marker
```

File: `apps/api/src/admin/__tests__/playground-session.test.ts`

Cases:

```text
POST /admin/:key/playground/session -> 200
DELETE /admin/:key/playground/session/:id -> 200
DELETE unknown session -> 404
wrong admin key -> 404
```

#### Browser Service Auth Tests

Preferred location if service tests exist:

```text
apps/playwright-service-ts/__tests__/auth.test.ts
```

Cases:

```text
POST /browsers without auth and BROWSER_SERVICE_API_KEY set -> 401
POST /browsers with auth -> 200
GET /browsers/:id/view without auth -> 401
WS /browsers/:id/view/ws without auth -> rejected
```

If no service harness exists, start with API/admin route tests plus a TODO for direct service tests.

---

## Suggested PR Boundary

### PR A: Security And Boundary Corrections

Do first.

- remove public `/v2/live/*`
- remove public `__playgroundLive`
- browser-service auth
- admin WS proxy path fix
- base path/global fix in playground client
- guardrail tests

### PR B: `/scrape-cdp` Split And Config Cleanup

- add `PLAYWRIGHT_CDP_URL`
- add `/scrape-cdp`
- keep legacy `/scrape`
- update Docker compose and package scripts
- update CDP tests

### PR C: Resource Lifecycle

- browser service TTL cleanup
- artifact cleanup
- active-only session helpers
- cleanup tests

### PR D: Playground Live/Recorder UX

- mount `LiveView`
- mount/wire `RecorderPanel`
- add best-effort warnings for mobile/location
- polish diagnostics/warning rendering

If implementation pressure is high, PR A and PR B can be combined, but do not ship live/session work without PR A guardrails.

---

## Acceptance Criteria

The course correction is complete when:

1. `/v2/live/*` routes no longer exist.
2. Public `/v2/scrape` does not accept `__playgroundLive`.
3. Browser service stateful endpoints and WS require `BROWSER_SERVICE_API_KEY` when configured.
4. Admin playground session/live routes work through `/admin/:BULL_AUTH_KEY/playground/*`.
5. `playwright;cdp` is preferred locally and calls `PLAYWRIGHT_CDP_URL` / `/scrape-cdp`.
6. Legacy `PLAYWRIGHT_MICROSERVICE_URL` / `/scrape` remains available.
7. Browser service sessions and artifacts have cleanup.
8. Tests cover the public boundary, admin session route, service auth, and CDP behavior.

Run focused tests through harness:

```bash
pnpm harness jest src/admin/__tests__/playground.test.ts
pnpm harness jest src/admin/__tests__/playground-session.test.ts
pnpm harness jest src/__tests__/snips/v2/live-routes.test.ts
pnpm harness jest src/__tests__/snips/v2/scrape-playground-live-guard.test.ts
pnpm harness jest src/__tests__/snips/v2/scrape-playwright-cdp.test.ts
```

Use the project convention from `AGENTS.md`: prefer snips/E2E tests for API behavior, and gate Playwright/fire-engine-dependent tests with the existing test helpers.
