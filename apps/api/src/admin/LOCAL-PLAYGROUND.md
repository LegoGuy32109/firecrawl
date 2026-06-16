# Local API Playground — Design Plan

An admin-gated, locally-run interactive page (linked from [`admin-index.ts`](./admin-index.ts))
for exploring every v2 API with rich, diagnosable errors — and, for Scrape/Interact, driving a
buffed local browser engine with an embedded live view, an action **recorder**, and
record→replay you can export to hosted Firecrawl to save credits.

Companion to [RESPONSE-MODEL.md](./RESPONSE-MODEL.md) (target error envelope),
[V2-ERROR-AUDIT.md](./V2-ERROR-AUDIT.md) (the prioritized response fixes), and
[EMBEDDED-VIEW.md](./EMBEDDED-VIEW.md) (live-view feasibility; this doc supersedes its
Option A/B framing with the decisions below).

> File:line refs marked ✓ were read directly. The guiding constraint throughout:
> **minimize change to existing observable behavior.**

---

## Decision log (resolved with the owner)

| #   | Decision               | Resolution                                                                                                                                                                                                                                     |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Engine gating**      | New engine id **`playwright;cdp`**, present only when **`PLAYWRIGHT_CDP_URL`** is set. The existing `playwright` engine + stateless service are untouched. Opt-in / local-only; hosted is unaffected (fire-engine dominates there regardless). |
| 2   | **Service location**   | **Extend `apps/playwright-service-ts`** with additive stateful endpoints; existing `/scrape` stays byte-for-byte identical; reuse its browser launch / SSRF / proxy / ad-block.                                                                |
| 3   | **Session model**      | Session + live + record endpoints live under **`/admin/${BULL_AUTH_KEY}/playground/*`** (admin tooling, **not** public v2). Screencast WS is **proxied through the admin API** (single gated origin). Real `/v2` is called only for data ops.  |
| 4   | **Recorder**           | **Smart** recorder; selector ladder optimized for **agent legibility**. Output is canonical Firecrawl `actions` JSON — the same vocabulary the Agent emits.                                                                                    |
| 5   | **UI framework**       | **Preact + `@preact/signals`**, bundled by the already-present **esbuild** (jsx automatic), inlined into the admin HTML response. No new build tool, no `public/` dir.                                                                         |
| 6   | **v2 invocation**      | Page does **direct same-origin `fetch` to `/v2`** with an **optional API-key field**. Local bypass works keyless by default; a key (or `USE_DB_AUTHENTICATION=on`) makes auth/credit/rate-limit errors testable.                               |
| 7   | **Error transparency** | **v2 inputs frozen**; **v2 responses may grow.** Additive `code`/`errorId`/`details`/`diagnostics` + partial-status/`warning`, **and** a central `errorCodeToHttpStatus` normalizing wrong statuses.                                           |
| 8   | **Hosted hand-off**    | **Export-only first pass** (actions JSON + curl + SDK snippet); see "Reusing the recorded code-path" for further credit-savers.                                                                                                                |
| 9   | **First slice**        | **Error-transparency breadth-first** (see Phases).                                                                                                                                                                                             |
| 10  | **Video recording**    | **In-scope, Tier 1**: Playwright `recordVideo` → `recordingUrl`. Audio stays a fire-engine/pro feature.                                                                                                                                        |

---

## What's local vs what stays pro (fire-engine)

The `playwright;cdp` engine buffs **only** the capabilities that are cheap and high-value
locally; the rest deliberately remain reasons to upgrade to fire-engine.

**Buffed locally** (Playwright primitives): `actions` (click/write/press/scroll/wait),
`executeJavascript` (`page.evaluate`), `screenshot` + `screenshot@fullScreen`
(`page.screenshot({fullPage})`), `waitFor` **selector** (`page.waitForSelector`), and session
video recording (`recordVideo`).

**Stays pro / fire-engine:** `branding` (free-ish via `page.evaluate(getBrandingScript())` but
held back intentionally), `audio`/`video` **media extraction** (a separate `AVGRAB_SERVICE_URL`
downloader, not in repo — `transformers/audio.ts` ✓, `video.ts` ✓), `mobile`/`location`
emulation, `stealthProxy`/anti-bot, `atsv`, session **audio** recording (Xvfb+PulseAudio+ffmpeg).
Requesting an unsupported feature locally fails engine selection cleanly — surfaced as a
`FEATURE_UNSUPPORTED_LOCALLY` diagnostic (see Phase 1), not a confusing 500.

---

## Architecture

```
┌─ browser (admin page, Preact) ──────────────────────────────────────┐
│  • request builders (6 features)   • diagnostics/error renderer       │
│  • live-view <canvas>              • recorder panel + export          │
└───────┬───────────────────────────────────┬──────────────────────────┘
        │ direct fetch /v2 (+ optional key)   │ WS + fetch  /admin/<KEY>/playground/*
        ▼ (data ops, real errors)             ▼ (session/live/record — admin-gated)
┌─ Firecrawl API (one Express app, one origin) ───────────────────────┐
│  /v2/*  (inputs frozen; responses enriched + errorCodeToHttpStatus)  │
│  /admin/<KEY>/playground/*  (session mgmt, screencast WS PROXY)      │
└───────────────────────────────────────────────┬────────────────────┘
                                                 │ HTTP + WS (PLAYWRIGHT_CDP_URL)
                                                 ▼
┌─ apps/playwright-service-ts (extended) ─────────────────────────────┐
│  /scrape                 UNCHANGED (stateless)                       │
│  POST /sessions, DELETE /sessions/:id      NEW (stateful, TTL)       │
│  WS   /sessions/:id/view (CDP screencast)  NEW                       │
│  POST /sessions/:id/act  (run/record actions)  NEW                   │
│  recordVideo on context → recordingUrl     NEW                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Response envelope + status normalization (all v2)

Implements the [V2-ERROR-AUDIT.md](./V2-ERROR-AUDIT.md) prioritized fixes on **responses only**
(inputs untouched). No UI yet — this is the backbone the visualizer renders.

- Every error body carries `code` (from an expanded `ErrorCodes`), `errorId` (in body, not just
  logs), structured `details`, and a default-on `diagnostics` block (this is a public fork — see
  RESPONSE-MODEL.md decision).
- Silent-success cases gain honesty: search per-source status, map degraded/`warning`, crawl
  `failureCount`/`failuresByCode`, browser-exec nonzero-exit signal (V2-ERROR-AUDIT P2).
- **Central `errorCodeToHttpStatus(code)`** replaces per-controller ladders; fixes DNS-as-200,
  client-caused-500, engines-failed→502, etc. (RESPONSE-MODEL.md change #2). This is the one
  intentional behavior change to existing statuses — owner-approved.
- Worker→API boundary stops dropping `TransportableError.code` (`scrape-worker.ts:767`,
  agent-reported) by serializing across the hop (`error-serde.ts` already exists).

## Phase 2 — Six-feature request/response/error visualizer (UI)

The Preact page, served at `/admin/${BULL_AUTH_KEY}/playground`. Panels for **Search, Scrape,
Interact, Crawl, Monitor, Agent**. Each: a request builder, a "send" that does a **direct
same-origin `fetch` to `/v2`** (optional key field), and a renderer that decodes the Phase-1
envelope — maps `code` → explanation + suggested fix, shows `errorId`, `details`, and the
`diagnostics` waterfall. Async jobs (crawl/agent) poll their status endpoints and render the
failure aggregation.

## Phase 3 — Buffed engine + embedded view + recorder (Scrape/Interact)

The novel browser-driving loop.

**3a. `playwright;cdp` engine** (`engines/index.ts`): new entry in the `Engine` union +
`engineOptions` advertising `actions/screenshot/screenshot@fullScreen/waitFor`, selected only
when `PLAYWRIGHT_CDP_URL` is set (mirror the `useFireEngine`/`usePlaywright` gating at
`engines/index.ts:50-83` ✓). Handler posts to the new service like the existing playwright
handler (`playwright/index.ts:8-48` ✓) but against the stateful endpoints.

**3b. Stateful service endpoints** (`apps/playwright-service-ts`, additive): `POST /sessions`
(keep a `context`+`page` alive, TTL'd, reusing the existing `Semaphore`), `WS /sessions/:id/view`
(CDP `Page.startScreencast` → JPEG frames; interactive mode replays `Input.dispatch*` back),
`POST /sessions/:id/act` (run/record), `DELETE /sessions/:id`. `recordVideo: { dir, size }` on
context creation → `recordingUrl` on teardown.

**3c. Admin session proxy** (`/admin/${BULL_AUTH_KEY}/playground/*`): owns session lifecycle and
**proxies the screencast WS** (express-ws is already app-wide — `index.ts:59` ✓; `attachWsProxy`
exists — `index.ts:126` ✓). Returns the rich engine diagnostics (waterfall, per-action results,
timings, `recordingUrl`) that v2 can't — keeping v2 responses untouched here while still
delivering transparency.

**3d. Recorder** — see below.

---

## The recorder (Phase 3d)

Inject a recorder into the page (`addInitScript`) that translates real DOM events into canonical
Firecrawl actions. Hard constraints (verified against `actionSchema`, `types.ts:247-319` ✓):

- **CSS selectors only** — local replay uses `document.querySelector` for scroll
  (`scrape-replay.ts:330` ✓) and hosted fire-engine expects CSS. No `text=`/`role=` locators.
- **`write` has no selector** (`types.ts:279-282` ✓) — emit a focus `click` before each `write`.
- **Vocabulary = `click`/`write`/`press`/`scroll`/`wait`** only. No `select`/`hover`/`check` in
  the public schema — dropdowns/checkboxes degrade to clicks; some interactions can't be captured.

**Smart behaviors:** coalesce keystrokes into one `write`; auto-insert `wait`-on-selector after
navigation/DOM-settle; selector ladder ordered for **agent legibility** —
`#id` → `[data-testid=…]`/`[data-*]` → `[aria-label=…]`/role-as-CSS → minimal unique path, with
positional `nth-child` only as last resort.

**Replay is already built**: `buildReplayScript` (`scrape-replay.ts:204-370` ✓) executes exactly
this vocabulary against a Playwright `page`. So the recorder is the inverse of existing code, and
recorded arrays replay locally for free.

---

## Hosted hand-off & reusing the recorded code-path

**First pass (export-only):** the page emits the actions JSON plus a runnable curl + SDK snippet
prefilled with the array. The dev runs it on hosted with their own key. The actions array is a
first-class field on `POST /v2/scrape` already, so **zero translation** — iterate locally free,
spend credits once on the validated hosted run. No outbound calls or key handling from the local
instance.

**Other places the same action code-path saves credits** (documented for later):

- **Agent seeding** — feed a recorded path as the Agent's starting plan (same vocabulary), cutting
  LLM exploration steps/cost.
- **Crawl/batch templates** — record one interaction sequence, replay it per-URL across a crawl
  instead of re-deriving each time.
- **Monitor / selector-drift checks** — replay a path locally on a schedule; warn when a selector
  stops resolving _before_ a paid hosted run wastes credits.
- **E2E fixtures** — recorded paths become `snips` test inputs.
- **Index reuse** — cache a successful path/result to skip re-scraping.

---

## Security & behavior-minimization notes

- Everything new is **opt-in or admin-gated**: the engine appears only with `PLAYWRIGHT_CDP_URL`;
  the playground + session + WS sit behind the existing `BULL_AUTH_KEY` path-secret; `/v2` inputs
  are frozen; the stateless `/scrape` is untouched.
- The new service must reuse `playwright-service-ts`'s SSRF/private-IP guards
  (`assertSafeTargetUrl`, `api.ts:235-258` ✓). For local targets, gate relaxation behind an
  explicit `ALLOW_LOCAL` flag.
- The screencast WS never exposes the service port to the browser (proxied through admin).
- The only intentional change to _existing_ behavior is HTTP status normalization (Branch 7) —
  called out explicitly so it isn't a surprise.

## Open defaults (sensible unless revisited)

- Session TTL ~5 min idle / 15 min max; concurrency via the existing `MAX_CONCURRENT_PAGES`
  semaphore. Recordings written to a tmpfs dir, served via a short-lived admin URL, GC'd on
  session end.
- Screencast: JPEG q70, `everyNthFrame:1`, capped resolution.
