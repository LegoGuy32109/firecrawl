# Spec — `playwright;cdp` Engine & local parity upgrades

A dedicated track (the "3a" piece broken out of the playground work). Goal: raise the
**open-source local scrape path** toward `fire-engine;chrome-cdp` parity by adding a new
CDP-driven engine and upgrading `apps/playwright-service-ts`, so self-hosted/local users hit
`FEATURE_UNSUPPORTED_LOCALLY` / `SCRAPE_ACTIONS_NOT_SUPPORTED` far less often.

This track ships and is testable **on its own** — it has no dependency on the playground UI.
It depends on [SPEC-ERRORCODES.md](./SPEC-ERRORCODES.md) only for the error codes it emits
(`ScrapeError.ACTION`, `LocalError.FEATURE_UNSUPPORTED`, `ScrapeError.BRANDING_NOT_SUPPORTED`).
It shares its backend (`playwright-service-ts`) with [SPEC-LIVE-SESSION.md](./SPEC-LIVE-SESSION.md)
— coordinate (see §6).

> Companion analysis: [ENGINE-COMPARISON.md](./ENGINE-COMPARISON.md) (the capability matrix this
> spec closes). Refs marked ✓ verified this pass; others from ENGINE-COMPARISON / source agents —
> re-grep before editing (line numbers drift).

---

## 1. Current state (verified)

- The local engine shortlist after stripping hosted/enterprise/fire-engine backends is
  `playwright` (only if `PLAYWRIGHT_MICROSERVICE_URL` set), `fetch`, `pdf`, `document`
  (`engines/index.ts:65-83`, ENGINE-COMPARISON).
- The OSS Playwright engine is a **thin page-loader**: its handler (`engines/playwright/index.ts:8`
  ✓) sends only `{ url, wait_after_load, timeout, headers, skip_tls_verification }` and hardcodes
  `proxyUsed: "basic"`. `playwrightMaxReasonableTime` is `waitFor + 30000` (`:50` ✓). Quality `20`
  (`engines/index.ts`, ENGINE-COMPARISON).
- Its `engineOptions.featureFlags` are almost all `false`: **no** actions, executeJavascript,
  screenshot, waitFor-by-selector, location, mobile, stealth, branding, audio/video. Only
  `waitFor` (fixed delay), JS rendering, and `skipTlsVerification` are `true` (ENGINE-COMPARISON).
- `apps/playwright-service-ts` owns a real headless Chromium launched once and reused
  (`chromium.launch({ headless:true })`, viewport 1280×800, `api.ts:185-202`), but exposes only
  `POST /scrape` → `{ content, pageStatusCode, contentType, pageError }` (HTML only). **No CDP, no
  screenshots, no actions; context closed after each request.** SSRF guard `assertSafeTargetUrl`
  blocks private IPs (`api.ts:235-258`).

So the gap is specific: we own a drivable Chromium and the entire API engine layer; we are missing
the **feature breadth** in both the service and the engine handler.

---

## 2. Target capability (what `playwright;cdp` adds)

New engine id **`playwright;cdp`** alongside the existing `playwright`. The bare `playwright`
engine stays as the low-feature fast path; `playwright;cdp` is the higher-feature variant that
drives the upgraded service over a CDP session.

| Feature flag                      | `playwright` (today) | **`playwright;cdp` (target)** | `fire-engine;chrome-cdp` |
| --------------------------------- | -------------------- | ----------------------------- | ------------------------ |
| actions (click/scroll/type/press) | ❌                   | **✅**                        | ✅                       |
| executeJavascript                 | ❌                   | **✅** (via actions)          | ✅                       |
| screenshot / fullScreen           | ❌                   | **✅**                        | ✅                       |
| waitFor (selector)                | delay only           | **✅ delay + selector**       | ✅                       |
| JS rendering                      | ✅                   | ✅                            | ✅                       |
| skipTlsVerification               | ✅                   | ✅                            | ✅                       |
| location (geo spoof)              | ❌                   | **✅** (CDP `Emulation`)\*    | ✅                       |
| mobile (device emulation)         | ❌                   | **✅** (CDP `Emulation`)\*    | ✅                       |
| stealthProxy (anti-bot)           | ❌                   | ❌ (out of scope)             | ✅                       |
| branding                          | ❌                   | ❌ (out of scope)             | ✅                       |
| audio / video extraction          | ❌                   | ❌ (out of scope)             | ✅                       |

\* `location`/`mobile` are CDP-cheap (`Emulation.setGeolocationOverride` /
`Emulation.setDeviceMetricsOverride`) but **Phase E3** — land actions/screenshot/waitFor first.

**Explicitly out of scope** (keep emitting the existing codes): `stealthProxy`, `branding`,
`audio`/`video`. These stay closed/hard and continue to produce
`LocalError.FEATURE_UNSUPPORTED` (with `details.requiresEngine:"fire-engine"`) and
`ScrapeError.BRANDING_NOT_SUPPORTED` (with `details.reason:"no_cdp_engine"`). The point of this
track is to **shrink** that surface, not eliminate it.

---

## 3. API-side engine wiring (`scraper/scrapeURL/engines/`)

1. **Engine union + list:** add `"playwright;cdp"` to the `Engine` union (`engines/index.ts:35-40`)
   and to the env-gated `engines[]` list (`:65`), included only when `PLAYWRIGHT_MICROSERVICE_URL`
   is set (same gate as `playwright`).
2. **Handler:** add `scrapeURLWithPlaywrightCDP` to `engineHandlers` (`:166`). It sends the fuller
   payload (url, waitFor delay + selector, actions[], screenshot opts, headers,
   skip_tls_verification) to the upgraded service (§4) and maps the response (content + screenshots
   - action results) into the standard engine result shape.
3. **`engineOptions`:** set the target `featureFlags` from §2; pick `quality` **between bare
   `playwright` (20) and `fire-engine;chrome-cdp` (50)** — high enough that the waterfall prefers it
   over the thin `playwright` engine when the requested features need it, but it never outranks
   fire-engine where fire-engine is present. Add its `engineMRTs` entry mirroring
   `playwrightMaxReasonableTime` plus action time budget.
4. **Error mapping:** action failures → `ScrapeError.ACTION` with `details` (action index/selector
   when available — §4a of SPEC-ERRORCODES already reserves `ActionError` shape). A request for a
   still-unsupported feature → `LocalError.FEATURE_UNSUPPORTED`. The waterfall's
   `AddFeatureError`/`RemoveFeatureError` control-flow signals stay plain (SPEC-ERRORCODES §7).

No v2 request-shape change: the engine consumes the **already-accepted** scrape options (actions,
screenshot, waitFor); it only widens which engine can satisfy them locally.

---

## 4. `playwright-service-ts` upgrades

Extend the owned service to support the target features. Two shapes are possible; pick per
implementation taste, but **keep the SSRF guard** (`assertSafeTargetUrl`) on by default and gate
localhost targets behind an explicit `ALLOW_LOCAL` flag (needed by the local playground; see
SPEC-LIVE-SESSION §5):

- **Widen `POST /scrape`** to accept `{ actions?, screenshot?, waitFor: { delay?, selector? } }`
  and return `{ content, pageStatusCode, contentType, pageError, screenshots?, actionResults? }`,
  driving them via Playwright's own API (`page.click/fill/press/evaluate`, `page.screenshot`,
  `page.waitForSelector`) — no raw CDP needed for scrape-time features.
- Raw CDP (`context.newCDPSession`) is **not required for the scrape path**; it _is_ required for
  the live screencast (SPEC-LIVE-SESSION). Keep them separable: the engine path can be pure
  Playwright API; the live path adds the CDP screencast. The "cdp" in the engine name refers to the
  Chromium-driven feature breadth, not to a literal CDP transport requirement on the scrape path.

Reuse the existing single-launch-Chromium pattern (`api.ts:185-202`). Per-request a fresh context
is fine for scrape (the kept-alive _session_ is the live-session track's concern, not this one).

---

## 5. Error-model integration (consumes SPEC-ERRORCODES)

- The `ERROR_CATALOG` `fix` strings for `LocalError.FEATURE_UNSUPPORTED` and
  `ScrapeError.ACTIONS_NOT_SUPPORTED` should be revisited: with `playwright;cdp` present, "requires
  fire-engine" is no longer always true for actions/screenshot. Keep the message accurate by
  conditioning on what the local engine now supports (or soften to "requires an actions-capable
  engine (fire-engine, or a configured playwright;cdp service)").
- This track is the **first real thrower** of `ScrapeError.ACTION` with structured `details`, so it
  doubles as a proof that the SPEC-ERRORCODES `details` transport (WP3) survives the worker hop.

---

## 6. Coordination with the live-session track

`playwright;cdp` (this spec) and the local Browser Service shim (SPEC-LIVE-SESSION, EMBEDDED-VIEW
Option A) **both extend `apps/playwright-service-ts`**. They want different things from it:

- this track: richer one-shot scrape (actions/screenshot/waitFor), context-per-request.
- live-session: a _kept-alive_ session + CDP `Page.startScreencast` viewer.

Build the kept-alive session machinery **once** (in the service) and let the scrape path opt out of
it. Don't fork the service. If both tracks run in parallel, land the service's session/launch
refactor first as a shared base.

---

## 7. Phasing (each independently shippable)

- **E1:** `waitFor` selector + `screenshot`/`fullScreen` on the service + engine handler + flags.
  Smallest parity win, no action-execution risk.
- **E2:** `actions` (click/scroll/type/press) + `executeJavascript`. Emits `ScrapeError.ACTION`.
- **E3:** `location` + `mobile` via CDP `Emulation` (optional; lowest priority).

---

## 8. Tests (snips)

- Gate behind `!process.env.TEST_SUITE_SELF_HOSTED` is **wrong here** — these are the OSS-local
  cases. Gate the cdp-engine snips behind **`PLAYWRIGHT_MICROSERVICE_URL` being set** (skip
  otherwise), and ensure they do **not** require `FIRE_ENGINE_BETA_URL`. Use `scrapeTimeout` from
  `./lib`.
- Happy path: a scrape with a `screenshot` + a `click`/`waitFor selector` action resolves via
  `playwright;cdp` (assert the engine used and a non-empty screenshot/result).
- Failure path: a bad selector action → `ScrapeError.ACTION` with `details` and the normalized
  HTTP status from `errorCodeToHttpStatus` (422).
- Regression: with `FIRE_ENGINE_BETA_URL` present, the waterfall still prefers fire-engine (quality
  ordering) — `playwright;cdp` does not steal traffic from it.

---

## 9. Open questions

1. **Engine naming.** `playwright;cdp` matches the user's framing and the `fire-engine;chrome-cdp`
   convention, but the scrape path may not literally use CDP (§4). Acceptable as a capability label,
   or rename to `playwright;full` / keep `playwright` and just widen its flags behind a service-
   capability probe? (Widening the existing `playwright` engine risks changing behavior for current
   self-hosters who rely on its thin profile — a _new_ id is safer.)
2. **Quality rank** exact value between 20 and 50 — needs a quick waterfall trace to confirm it's
   selected when (and only when) the requested features demand it.
3. **`location`/`mobile`** — include in this track (E3) or defer entirely? They're cheap but
   untested locally.
