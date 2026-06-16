# API Response Model — Design Notes

Goal: make Search / Scrape / Interact (and later Crawl / Monitor / Agent) responses
self-explaining. Replace broad exception handling and silently-swallowed failures with
accurate, machine-readable, diagnosable responses — **by default, for every caller**.

Decision (2026-06-16): this repo is a public fork. Internal engine/provider names are
already visible in source, so diagnostics are **not gated** — they ship in the default
public response. We are willing to shape the default public API so devs immediately see
better results.

---

## What already exists (keep, don't rebuild)

- `TransportableError` base class with `code: ErrorCodes`, `serialize()`/`deserialize()`
  — `src/lib/error.ts:37`
- Cross-process transport — `src/lib/error-serde.ts`
- ~40 specific subclasses with good human messages — `src/lib/error.ts`,
  `src/scraper/scrapeURL/error.ts`
- Discriminated-union envelope `{ success: false, code?, error, details? }` vs
  `{ success: true, data }` — `src/controllers/v2/types.ts:1314`

The typed-error system is solid. The detail leaks out at five boundaries below.

---

## The five leak points

1. **`code` is optional / inconsistent.** Auth, permission, keyless paths return bare
   `{ success: false, error }` with no code. — `controllers/v2/scrape.ts:83,136`
   → Fix: `code` is required on every error response.

2. **Status codes are ad-hoc, mostly 500.** No `code → HTTP` map; per-controller if/else.
   DNS → 200(!), most TransportableErrors → 500 even when client-caused.
   — `controllers/v2/scrape.ts:340-405`
   → Fix: one central `errorCodeToHttpStatus(code)`.

3. **Worker→API boundary drops the code.** `scrape-worker.ts:767` rewraps as plain
   `new Error(message)`, losing `TransportableError.code`. `serializeTransportableError`
   exists for this hop but isn't used consistently.
   → Fix: serialize across the worker boundary, deserialize in the controller.

4. **Search swallows everything into `{}`.** `search/v2/index.ts:81` catches all provider
   errors → `{}`. Network failure, 429, misconfig, and genuine zero-results are
   indistinguishable: client gets `{ success: true, data: {}, creditsUsed: 0 }`.
   No per-source status in `SearchV2Response` (`lib/entities.ts:166`).
   → Fix: per-source status block. **Highest-value change.**

5. **Interact/actions are a black box.** `ActionError` carries only a raw fire-engine
   string (`scraper/scrapeURL/error.ts:203`); detection is `status.error.includes("Element")`
   with a literal `// TODO: improve this later` (`.../fire-engine/checkStatus.ts:245`).
   Lost: which action index/type/selector failed, partial successes, page state. The
   replay path already knows index+type (`scrape-replay.ts`) but flattens it to a string
   and aborts the whole sequence.
   → Fix: per-action result array preserving partial success.

---

## Target envelope

Every failure, no exceptions:

```jsonc
{
  "success": false,
  "code": "SCRAPE_ALL_ENGINES_FAILED", // ALWAYS present, from ErrorCodes
  "error": "Human-readable summary", // existing verbose message
  "errorId": "uuidv7", // in BODY, not just logs
  "details": {
    // structured, per-code
    "enginesTried": ["fire-engine", "playwright"],
    "hostname": "example.com",
  },
  "diagnostics": {
    // default-on (public fork)
    "traceId": "...",
    "durationMs": 8123,
    "steps": [
      /* engine waterfall / per-action / per-source */
    ],
  },
}
```

Three enabling changes:

1. **`details` becomes first-class on each `TransportableError`.** The data (hostname,
   engine list, page count) already lives in the constructors as prose — lift it into the
   `serialize()` payload. `error` stays human; `details` becomes machine-readable. Stops
   the need to regex messages.

2. **Single `errorCodeToHttpStatus(code)` map** replaces every controller ladder.
   Suggested: `SCRAPE_TIMEOUT→408`; anti-bot/unsupported/ZDR→`422`; auth→`403`;
   not-found→`404`; engines-failed→`502`; unknown→`500`. Fix DNS-200 quirk here, once.

3. **`diagnostics` block, default-on.** Carries what's currently thrown away:
   - **Scrape:** engine waterfall — each engine tried + why it fell through
     (`EngineError`, `AddFeatureError`, timeout).
   - **Search:** per-source status —
     `{ web: { status: "ok", count: 5 }, news: { status: "failed", code: "PROVIDER_429" } }`.
   - **Interact:** per-action results —
     `{ index, type, selector, status, durationMs, error? }`, preserving partial success.

---

## Suggested sequencing (when work starts)

1. Search per-source status — smallest, most visible win; template for `diagnostics`.
2. Shared types: required `code`, `errorId` in body, `details`, `diagnostics` +
   central `errorCodeToHttpStatus`.
3. Migrate scrape controller onto the map; serialize across the worker boundary.
4. Per-action results for interact.
5. Playground UI renders `diagnostics` for Search / Scrape / Interact.
