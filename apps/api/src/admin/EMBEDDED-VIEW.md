# Embedded Live Views for the Local Dev Playground

What it would take to show a live, embedded view of the page **as the API runs it** —
locally, without the closed-source pieces. Companion to [RESPONSE-MODEL.md](./RESPONSE-MODEL.md)
and [V2-ERROR-AUDIT.md](./V2-ERROR-AUDIT.md).

> File:line refs marked ✓ were read directly; others came from source-analysis agents and
> should be spot-checked (line numbers drift).

---

## Correction up front: it's not fire-engine that gates the live view

The live/embedded view in the existing **interact** path is **not** produced by fire-engine.
It comes from a _second_ closed-source service, the **Browser Service** (`BROWSER_SERVICE_URL`).
Two different proprietary backends are in play, and they do different jobs:

| Backend             | Env gate               | Used by                                                                    | Produces                                                                     |
| ------------------- | ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **fire-engine**     | `FIRE_ENGINE_BETA_URL` | scrape **actions** (click/scroll/screenshot/JS), branding, mobile/location | scrape results + screenshots (poll-based, **no live stream**)                |
| **Browser Service** | `BROWSER_SERVICE_URL`  | `/v2/scrape/:jobId/interact`, `/v2/browser`                                | persistent CDP session + **`iframeUrl` / `interactiveIframeUrl` live views** |

So "the embedded view is blocked behind fire-engine" is slightly off: the embedded view is
blocked behind the **Browser Service**. fire-engine never streams a live view at all — even
in production it returns screenshots by polling `GET {FIRE_ENGINE_BETA_URL}/scrape/{jobId}`
(`checkStatus.ts:150`). That's good news: the live-view contract is small and well-defined,
and the API side is already open source.

---

## How the live view works today (interact path)

The API never renders anything itself. It calls the Browser Service over a 3-endpoint HTTP
contract and passes the returned URLs straight back to the client.

**The contract** (verified in `lib/scrape-interact/browser-service-client.ts` ✓):

- `POST /browsers` → `{ sessionId, cdpUrl, viewUrl, iframeUrl, interactiveIframeUrl, expiresAt }`
  (`browser-service-client.ts:7-14` ✓)
- `POST /browsers/{id}/exec` → `{ stdout, result, stderr, exitCode, killed }` (`:16-22` ✓)
- `DELETE /browsers/{id}` → `{ ok, sessionDurationMs? }` (`:24-27` ✓)
- Auth: `Authorization: Bearer ${BROWSER_SERVICE_API_KEY}` (`:52-53` ✓)
- Base URL: `${BROWSER_SERVICE_URL}${path}` (`:67` ✓)

**Data flow** (`controllers/v2/scrape-browser.ts`, agent-reported):

1. `POST /v2/scrape/:jobId/interact` → verify team owns the scrape (`:146-159`).
2. `buildReplayContextFromScrape()` extracts URL + waitFor + actions from the original scrape
   (`scrape-replay.ts:137` ✓ exists), generates a Playwright replay script (`buildReplayScript`).
3. Create or reuse a Browser Service session (`POST /browsers`), then **replay the original
   scrape** into it via `POST /browsers/{id}/exec` so the live view starts in the same state
   the scrape ended in (`:614`, `:666-675`).
4. Persist to `browser_sessions`: `cdp_url` = raw CDP WS, `cdp_path` = `iframeUrl`,
   `cdp_interactive_path` = `interactiveIframeUrl` (`:777-779`; the columns are explicitly
   "repurposed" comments in `browser-sessions.ts:22-24`).
5. Response returns `liveViewUrl: session.cdp_path` and
   `interactiveLiveViewUrl: session.cdp_interactive_path` (`:364-365`).

So the client already receives an embeddable URL. The viewer (read-only iframe vs interactive
iframe) is rendered **inside the Browser Service**, not here.

## What open source actually gives you

- **`apps/playwright-service-ts`** — a real headless Chromium, launched once and reused
  (`chromium.launch({ headless: true, ... })`, viewport 1280×800, `api.ts:185-202` ✓). But its
  only endpoint is `POST /scrape` returning `{ content, pageStatusCode, contentType, pageError }`
  (HTML only). **No CDP exposed, no screenshots, no screencast, context closed after each
  request.** It is the closest thing we own to a drivable browser.
- **fire-engine engine** — supports actions/screenshots but is closed and poll-based; the
  Playwright _scrape_ engine explicitly sets `actions:false, screenshot:false`
  (`engines/index.ts`, agent-reported). So there is no OSS path that both runs actions _and_
  could be screencast.

The gap is narrow and specific: **we own a Chromium we can drive (playwright-service), and we
own the entire API side of the live-view contract. We're only missing the piece that turns
that Chromium into a streamable session.**

---

## The path to local dev views

Two independent options. They don't conflict — A reuses the existing interact UI, B adds
viewing to ordinary scrapes.

### Option A — local Browser Service shim (recommended, least API change)

Implement the 3-endpoint contract above as a small local service (extend
`playwright-service-ts` or a new `apps/browser-service-local`), then set
`BROWSER_SERVICE_URL=http://localhost:PORT`. **No v2 controller changes** — the API already
creates sessions, replays scrapes, returns `liveViewUrl`, and bills. The shim must:

1. **`POST /browsers`** — `browser.newContext()` + `newPage()`, keep it alive keyed by
   `sessionId`, enforce a TTL. Return:
   - `cdpUrl`: from `browser` launched with `--remote-debugging-port` (Chromium's
     `webSocketDebuggerUrl`), or a Playwright `browserType.launchServer().wsEndpoint()`.
   - `iframeUrl` / `interactiveIframeUrl`: point at **our own** viewer page (below),
     e.g. `http://localhost:PORT/view/{sessionId}` and `.../view/{sessionId}?interactive=1`.
2. **`POST /browsers/{id}/exec`** — run the supplied Node/Playwright code against the kept-alive
   `page` (the replay script and agent both go through here). A `vm`/child-process sandbox with
   `page`/`context` in scope.
3. **`DELETE /browsers/{id}`** — `context.close()`, return `sessionDurationMs`.
4. **The viewer** (the actual "embedded view") — a static HTML page + WS endpoint per session:
   - Server opens a CDP session on the page:
     `const cdp = await context.newCDPSession(page); await cdp.send('Page.startScreencast', { format:'jpeg', quality:70, everyNthFrame:1 })`.
   - On each `cdp.on('Page.screencastFrame', f => ws.send(f.data))`, push the base64 JPEG over
     a WebSocket, then `cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId })`.
   - Client draws frames into an `<img>`/`<canvas>`. For **interactive** mode, forward
     `mousemove/click/keydown` from the canvas back over the WS and replay them with
     `cdp.send('Input.dispatchMouseEvent' | 'Input.dispatchKeyEvent', ...)`.

   This is exactly what the proprietary Browser Service does internally; `startScreencast` is a
   stock CDP method, so a ~200-line implementation gets a working live view.

Local dev considerations: drop `BROWSER_SERVICE_API_KEY` (or accept any), allow `localhost`
targets (the prod playwright-service blocks private IPs/SSRF — `assertSafeTargetUrl`,
`api.ts:235-258` ✓ — gate that behind an `ALLOW_LOCAL` flag), and skip/short-circuit billing
when `USE_DB_AUTHENTICATION` is off.

### Option B — screencast ordinary scrapes (new, more invasive)

To watch a plain `POST /v2/scrape` as it loads (no interact), the scrape would have to run on a
**screencast-capable, kept-alive** engine. Today scrape actions need fire-engine; the OSS
Playwright scrape engine does neither actions nor screencast. So Option B means:

1. Add a screencast WS endpoint to `playwright-service-ts` (same CDP `startScreencast` mechanism
   as A.4), keyed by a scrape/session id.
2. Surface a `liveViewUrl` on the **scrape kickoff** response so the playground can attach
   before the page finishes — this is a new field on the scrape envelope and ties into the
   `diagnostics` block proposed in RESPONSE-MODEL.md.
3. Accept that without fire-engine the visible run is page-load only (no click/scroll), since
   the OSS engine doesn't execute actions.

Option B is the more "magical" demo (watch any scrape live) but requires real v2 changes and
only shows action sequences when fire-engine is present. **Start with A.**

---

## Minimal v2 API changes

- **Option A: effectively none.** The contract already exists; you're swapping the backend the
  env var points at. Optional niceties: make `liveViewUrl`/`interactiveLiveViewUrl` first-class,
  documented fields (today they're ad-hoc keys on the interact 200), and return a clear
  `DEPENDENCY_UNAVAILABLE` code (per V2-ERROR-AUDIT P4) instead of a bare 503 when
  `BROWSER_SERVICE_URL` is unset (`scrape-browser.ts:526-535`).
- **Playground UI:** render an `<iframe src={liveViewUrl}>` (or a `<canvas>` WS client if you
  expose screencast directly) next to the request/response panes. The interact response already
  carries everything needed.
- **Option B only:** add `liveViewUrl` to the scrape envelope + a session registry in
  `playwright-service-ts`.

## Open questions before building

1. **A or B first?** A reuses the whole interact pipeline (replay, billing, session table) and
   ships a live view with near-zero API change. B is a bigger lift for the broader "watch any
   scrape" demo. Recommend A as the playground's first embedded view.
2. **Raw CDP iframe vs our screencast viewer?** Embedding `cdpUrl` directly (e.g. via a CDP
   front-end) is faster to stand up but heavier and clunkier to make interactive; the
   `startScreencast` + canvas approach is more code but is what gives the clean, controllable
   embed.
3. **Sandbox for `/exec`.** The replay/agent path sends arbitrary Node to `/browsers/{id}/exec`.
   Locally that's lower-risk, but the shim still needs a basic isolation boundary.
