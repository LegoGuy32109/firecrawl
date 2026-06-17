# Spec — Playground UI

Implementation spec for the interactive page (Phases 2–3 of
[LOCAL-PLAYGROUND.md](./LOCAL-PLAYGROUND.md)). Consumes the envelope from
[SPEC-ERRORCODES.md](./SPEC-ERRORCODES.md).

> Refs marked ✓ read directly.

---

## 1. Surface & gating

- Route: `GET /admin/${BULL_AUTH_KEY}/playground` on `adminRouter` (`routes/admin.ts`), linked as a
  new row in `admin-index.ts`'s `keyedRoutes`.
- Gated by the existing path-secret only (same as every admin route). Admin tooling — **not** a
  public API.
- Same Express app/origin as `/v2` (`index.ts:108-109` ✓) → page calls `/v2` with no CORS hop.

## 2. Tech & build

- **Preact + `@preact/signals`** (Branch 5). New deps in `apps/api/package.json`.
- Client written as `.tsx` modules under `src/admin/playground/client/`; bundled by the
  already-present **esbuild** (`package.json:113` ✓) with `jsx: "automatic", jsxImportSource:
"preact"`, `format: "iife"`, minified, into a single string.
- The controller inlines that string: `res.send(html + '<script>' + bundle + '</script>')`. No
  `public/`/static dir, no new build tool (consistent with the zero-static admin pattern).
- Build step: an esbuild entry added to the api build script producing `playground.bundle.js`
  (imported by the controller as a string at build time, or read once at boot).
- **Shared catalog:** client code imports `ERROR_CATALOG`/`explainError`/`errorCodeToHttpStatus`
  from `lib/error-catalog.ts` (SPEC-ERRORCODES §4) — the same module the server imports. Keep that
  module free of node/server-only imports so this bundle stays clean (the StatusPill parity check
  in §6 also relies on the shared `errorCodeToHttpStatus`).
- **Styling:** reuse `admin-index.ts`'s dark theme tokens (`--bg/--panel/--ink/--accent/--get/
--post`, monospace) verbatim for visual consistency. `escapeHtml` shell stays.

## 3. Page layout

```
┌ header: ENV · Base · Path key · [ API key (optional) ] ──────────────┐
├ feature nav: Search Scrape Interact Crawl Monitor Agent ─────────────┤
├──────────────────────── two-pane body ──────────────────────────────┤
│ left: REQUEST BUILDER            │ right: RESPONSE / DIAGNOSTICS       │
│  • per-feature form fields       │  • status pill + timing             │
│  • raw JSON editor (toggle)      │  • success: data view               │
│  • [ Send ]                      │  • error: code → explanation,       │
│                                  │    errorId, details, diagnostics    │
│  (Scrape/Interact only:)         │    waterfall                        │
│  • live-view <canvas> + controls │                                     │
│  • recorder panel + export       │                                     │
└──────────────────────────────────────────────────────────────────────┘
```

## 4. Component tree (Preact)

```
<App>
  <Header/>                         // env, base, optional key field (apiKey signal)
  <FeatureNav/>                     // sets activeFeature signal
  <RequestBuilder feature/>         // form ⇄ rawJson; emits onSend(body)
  <ResponsePane>
    <StatusPill/>                   // http status + errorCodeToHttpStatus parity
    <SuccessView/> | <ErrorView/>   // ErrorView decodes the envelope (§6)
    <DiagnosticsWaterfall/>         // steps: engine waterfall / per-source / per-action
  </ResponsePane>
  // Scrape + Interact only:
  <LiveView/>                       // <canvas>, WS frames, interactive toggle
  <RecorderPanel/>                  // recorded actions[], edit, export
</App>
```

## 5. State (signals)

```ts
const apiKey = signal<string>(""); // optional; Authorization header
const activeFeature = signal<Feature>("scrape");
const requestBody = signal<Record<string, unknown>>({});
const response = signal<EnvelopeView | null>(null);
const inflight = signal<boolean>(false);
// session (scrape/interact)
const sessionId = signal<string | null>(null);
const interactive = signal<boolean>(false);
const recording = signal<boolean>(false);
const actions = signal<FirecrawlAction[]>([]); // canonical Firecrawl actions JSON
const recordingUrl = signal<string | null>(null);
```

## 6. Error / diagnostics renderer (the core value)

`<ErrorView>` decodes the [SPEC-ERRORCODES.md](./SPEC-ERRORCODES.md) envelope:

- **`code` → human explanation + suggested fix**, by importing the **shared `ERROR_CATALOG` /
  `explainError` from `lib/error-catalog.ts`** (SPEC-ERRORCODES §4) — the _same_ module the API
  uses. The page does **not** ship its own copy; there is one source of truth. esbuild bundles the
  catalog into the client because that module is intentionally dependency-free/browser-safe.
- **`errorId`** shown + copyable (correlate with server logs/Sentry).
- **`details`** rendered structurally per shape (e.g. `INSUFFICIENT_CREDITS` → "needs N, have M,
  short K"; `RATE_LIMIT_EXCEEDED` → limit/remaining/reset; `FEATURE_UNSUPPORTED_LOCALLY` →
  "requires fire-engine").
- **`diagnostics.steps`** as a waterfall: scrape engine attempts (which engine, why it fell
  through), search per-source status, interact per-action results.
- **Status pill** shows the HTTP status and flags mismatches against `errorCodeToHttpStatus` (a
  built-in check that the normalization works).

## 7. Data flow

- **Data ops (all 6 features):** `fetch('/v2/<feature>', { method, headers: apiKey ?
{Authorization:`Bearer ${apiKey}`} : {}, body })`. Async jobs (crawl/agent/batch) poll their
  status endpoints; render `failureCount`/`failuresByCode`. No request-shape changes — the page
  only sends fields the existing schemas already accept.
- **Live/record (scrape+interact):** talk to the admin session endpoints
  `/admin/${BULL_AUTH_KEY}/playground/session*`; open the screencast WS at
  `/admin/${BULL_AUTH_KEY}/playground/session/:id/view` (proxied through the API — `index.ts:59`
  express-ws ✓). Draw `Page.screencastFrame` JPEGs to `<canvas>`; in interactive mode forward
  pointer/key events back.

## 8. Recorder panel

- Toggle `recording`; as DOM events arrive (via the injected recorder, server-side), the admin
  session streams back canonical actions appended to the `actions` signal.
- Renders the editable action list; constraints from SPEC: CSS selectors, focus-`click` before
  `write`, vocabulary `click/write/press/scroll/wait` (see LOCAL-PLAYGROUND §recorder).
- **Export:** buttons for `actions` JSON, a prefilled `curl`, and an SDK snippet pointing at
  hosted (`api.firecrawl.dev`) — export-only (Branch 8). Show `recordingUrl` (.webm) when present.

## 9. Phasing

- **Phase 2 (ship first):** Header, FeatureNav, RequestBuilder, ResponsePane + ErrorView/
  DiagnosticsWaterfall for all 6 features. No browser-driving yet. Delivers the transparency value
  against the Phase-1 envelope.
- **Phase 3:** LiveView + RecorderPanel + export, wired to the `playwright;cdp` admin session.

## 10. Notes

- Keep the bundle small (Preact+signals ≈ 5KB) — aligns with the minimal-bloat steer.
- No secrets persisted server-side; the optional API key lives only in the `apiKey` signal
  (client memory), sent per-request.
- This page is the consumer that makes the SPEC-ERRORCODES work _visible_; build the two together.
