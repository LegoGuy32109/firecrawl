# Spec — Live Session & Screencast (playground live view)

The "3b/3c" track: a **non-interactive live view first**, then interactive input, then the
recorder **last**. Powers Phase 3 of [SPEC-PLAYGROUND-UI.md](./SPEC-PLAYGROUND-UI.md).

This spec is the **delta on top of** [EMBEDDED-VIEW.md](./EMBEDDED-VIEW.md), which already designs
the architecture (Option A: a local Browser Service shim + a CDP screencast viewer) and verified
the existing contract. **Read EMBEDDED-VIEW.md first** — this spec only pins scope, phasing,
reuse, and the error-model wiring; it does not restate the mechanism.

> Priority (from the build owner): a non-interactive "watch the browser" view is the ship target.
> Interactive input is next. The **selector recorder is explicitly deferred to the end** of
> development — it is the one genuinely hard piece and is not on the critical path.

> Refs marked ✓ verified this pass.

---

## 1. What already exists (do not rebuild)

Most of the "browser session service" is built. The new code is small and specific.

- **3-endpoint Browser Service contract** (`lib/scrape-interact/browser-service-client.ts` ✓):
  `POST /browsers` → `{ sessionId, cdpUrl, viewUrl, iframeUrl, interactiveIframeUrl, expiresAt }`;
  `POST /browsers/{id}/exec`; `DELETE /browsers/{id}`. Auth via `BROWSER_SERVICE_API_KEY`, base
  `BROWSER_SERVICE_URL`.
- **Session lifecycle, DB-backed** (`lib/browser-sessions.ts` ✓): insert / get / list /
  `updateBrowserSessionActivity` (TTL/activity), `claimBrowserSessionDestroyed`, team ownership,
  credits. This **is** the `BrowserError.*` surface.
- **Interact controller** (`controllers/v2/scrape-browser.ts` ✓): creates/adopts a session,
  replays the original scrape into it (`scrape-replay.ts` `buildReplayScript` ✓), enforces
  ownership + destroyed checks, and returns `liveViewUrl`/`interactiveLiveViewUrl`.
- **WS proxy pattern** (`services/agentLivecastWS.ts` ✓): `app.ws("/agent-livecast")` bridges a
  client socket to a worker socket bidirectionally. express-ws is already initialized
  (`index.ts:59` ✓, `routes/v2.ts:83` ✓).

The **only missing piece** (EMBEDDED-VIEW §"What open source actually gives you"): the component
that turns the owned Chromium into a **streamable session** — i.e. a local implementation of the
3-endpoint contract whose viewer does CDP `Page.startScreencast`. `apps/playwright-service-ts`
owns the Chromium but exposes no CDP/screencast today.

---

## 2. Scope & approach

Adopt **EMBEDDED-VIEW Option A** (local Browser Service shim) over Option B (screencast ordinary
scrapes). Rationale is in EMBEDDED-VIEW §"path to local dev views": Option A reuses the entire
interact pipeline (replay, billing, `browser_sessions`, the returned view URLs) with **near-zero
v2 controller change**, and the screencast viewer is ~200 lines of stock CDP.

The shim implements `POST /browsers` (kept-alive context, TTL), `POST /browsers/{id}/exec`
(sandboxed — see §5), `DELETE /browsers/{id}`, and **the viewer**: a per-session WS that runs
`Page.startScreencast({ format:"jpeg" })`, forwards each `Page.screencastFrame` to the client, and
**acks every frame with `Page.screencastFrameAck`** (this is the backpressure / frame-drop
mechanism — without the ack loop a slow client balloons memory). Point `BROWSER_SERVICE_URL` at it.
Build it into/next to `apps/playwright-service-ts` so it shares the launched Chromium and the
kept-alive session base with [SPEC-CDP-ENGINE.md](./SPEC-CDP-ENGINE.md) (see that spec §6).

### iframe vs canvas

The hosted Browser Service returns `iframeUrl`/`interactiveIframeUrl` (rendered inside that closed
service). For the **local** playground — the whole point — the shim must produce the viewer
itself, so the playground draws screencast frames into a `<canvas>`/`<img>` over a WS proxied by
the admin route (SPEC-PLAYGROUND-UI §7 already specifies `session/:id/view`). Keep one client path
(canvas + WS to the admin-proxied session view); if a real hosted `iframeUrl` is present it can be
embedded as-is, but the local screencast viewer is the path this track builds and tests.

---

## 3. Playground / admin wiring

- Admin session endpoints under `/admin/${BULL_AUTH_KEY}/playground/session*` (SPEC-PLAYGROUND-UI
  §7) proxy to the shim's 3-endpoint contract; `session/:id/view` proxies the screencast WS using
  the existing `agentLivecastWS` bridge **generalized** to a `sessionLivecastWS` (don't fork a
  near-duplicate — parameterize the worker URL by session/cdp target).
- Read-only first: the client only renders frames. No input forwarding in Phase L1.

---

## 4. Error-model wiring (consumes SPEC-ERRORCODES)

This track is the **first real thrower** of the `BrowserError.*` category that SPEC-ERRORCODES §2
defines (and which `scrape-browser.ts` today emits as bare strings like
`{ success:false, error:"Browser session has been destroyed." }`). Map them here:

- session unknown → `BrowserError.SESSION_NOT_FOUND` (404)
- expired/TTL → `BrowserError.SESSION_EXPIRED` (410, `details.expiredAt`)
- wrong team → `BrowserError.SESSION_FORBIDDEN` (403)
- concurrency cap → `BrowserError.SESSION_LIMIT_EXCEEDED` (429, `details.active/limit`)
- `/exec` failure → `BrowserError.EXECUTION_FAILED` (422, `details.exitCode/killed/timedOut`)
- shim down / `BROWSER_SERVICE_URL` unset → `BrowserError.SERVICE_UNAVAILABLE` (503,
  `details.dependency:"browser-service"`) — replaces the bare 503 noted in EMBEDDED-VIEW
  §"Minimal v2 API changes".

This resolves the open concern from the earlier review that Phase 1 defines `BrowserError` codes
with no thrower: the throwers land **here**, and the normalization of `scrape-browser.ts`'s bare
strings is part of SPEC-ERRORCODES WP6 regardless.

---

## 5. Security & limits

- **Admin-gated** by the path-secret only (same as every admin route); not public. Even so, an
  interactive browser is an SSRF surface (navigate to internal hosts) — keep
  `assertSafeTargetUrl` on by default and gate localhost behind `ALLOW_LOCAL` (EMBEDDED-VIEW
  "Local dev considerations").
- **`/exec` sandbox** (EMBEDDED-VIEW open Q3): the replay/agent path sends arbitrary Node to
  `/browsers/{id}/exec`. Needs at least a `vm`/child-process isolation boundary with only
  `page`/`context` in scope. Lower-risk locally but not zero.
- **Hard concurrency cap + aggressive idle TTL** — this is admin tooling, not a production browser
  pool. Expect 1–2 sessions; evict on idle (reuse `updateBrowserSessionActivity`). Over-cap →
  `BrowserError.SESSION_LIMIT_EXCEEDED`.
- Long-lived browsers stay **out of the API process** — they live in the shim/service, the API only
  proxies the WS (already true via `BROWSER_SERVICE_URL` + the WS proxy).

---

## 6. Phasing

- **L1 — non-interactive live view (ship target).** Shim `POST/exec/DELETE` + screencast viewer WS;
  generalize `agentLivecastWS` → `sessionLivecastWS`; playground renders read-only `<canvas>`.
  `BrowserError.*` thrown + normalized. Delivers "watch the browser run the scrape."
- **L2 — interactive input.** Forward canvas `mousemove/click/keydown` → `Input.dispatchMouseEvent`
  / `Input.dispatchKeyEvent`, with display-size→viewport coordinate scaling and DPR handling
  (EMBEDDED-VIEW A.4). `interactive` signal in the UI.
- **L3 — recorder + export (DEFERRED to the end).** Server-side DOM-event capture → canonical
  `click/write/press/scroll/wait` actions (SPEC-PLAYGROUND-UI §8). **Selector generation is the
  hard part** — lean on Playwright's selector engine / role locators, do **not** hand-roll; keep
  output constrained to the action vocabulary. Export: actions JSON / curl / SDK snippet. Not on
  the critical path; build last.

---

## 7. Tests

- Gate behind the shim being configured (`BROWSER_SERVICE_URL` pointing at the local shim) and
  **not** requiring fire-engine. Use `scrapeTimeout` from `./lib`.
- L1: create session → screencast WS emits ≥1 frame; `DELETE` returns `sessionDurationMs`.
- Error paths: unknown id → `BrowserError.SESSION_NOT_FOUND` (404); shim unreachable →
  `BrowserError.SERVICE_UNAVAILABLE` (503) — assert `code` + `errorCodeToHttpStatus`.
- L2 (when built): a forwarded click changes page state (assert via a follow-up `/exec` read).

---

## 8. Open questions

1. **Where does the shim live** — extend `apps/playwright-service-ts`, or a new
   `apps/browser-service-local`? Extending shares the Chromium with SPEC-CDP-ENGINE (preferred);
   a separate app is cleaner-isolated but duplicates launch/SSRF code. Recommend extending.
2. **Generalize `agentLivecastWS` vs new WS route** — confirm the existing proxy can be
   parameterized by session/cdp target without disturbing the live agent-livecast path.
3. **Does any hosted path still hand back real `iframeUrl`s** the playground should prefer over the
   local canvas viewer, or is canvas-only acceptable for the playground's stated local-first goal?
