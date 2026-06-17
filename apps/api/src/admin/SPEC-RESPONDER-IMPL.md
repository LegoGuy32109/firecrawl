# Impl Plan — Response builder consolidation & status-mapping fixes

Follow-up to the WP1–WP9 error refactor (see [SPEC-ERRORCODES-IMPL.md](./SPEC-ERRORCODES-IMPL.md),
[SPEC-ERRORCODES-WP9-STATUS.md](./SPEC-ERRORCODES-WP9-STATUS.md)). Addresses five review findings
on the landed code. All paths relative to `apps/api/src/`.

## Findings being fixed

1. **`httpStatus` override reintroduced status/code drift.** ~30 call sites pass a literal
   `httpStatus`; most duplicate `errorCodeToHttpStatus(code)`, a few (feedback) contradict it.
2. **Success responses only half-enveloped.** Success arms of `ScrapeResponse`/`SearchResponse`/…
   don't extend `ResponseCore`, so `status`/`diagnostics` were never compiler-required on success
   (e.g. `search.ts:289` returns bare `{success:true,data}`). Escape hatches: `jsonResponse(…as any)`
   (scrape/parse) and helpers typed `Response<any>`.
3. **Six per-controller error helpers** (`sendMonitorError`, `sendSearchError`, `feedbackFailure`,
   `sendError`, two `sendErrorResponse`) duplicate the same wrap-and-send.
4. **`error-serde.ts` still casts** `errorMap[code as ErrorCodes]` instead of using `parseErrorCode`.
5. **Envelope type named `WarningEntry`** while the latest spec calls it `Warning`.

## Design decisions (settled — do not relitigate)

- **One per-request responder, send-style.** `makeResponder(req, res)` → `{ ok, warn, fail,
asyncFail, step }`. It **owns `res` and the mutable `diagnostics` object** and **sends** (e.g.
  `return r.fail(...)`). Replaces all six helpers + both `jsonResponse` shims + the bare
  `errorResponse`/`okResponse` call sites.
- **No `feature` param, no posture enum, no per-feature code narrowing.** `r.fail` accepts any
  `ErrorCodes` (catalog completeness + the guard test already ensure validity). Keep it plain.
- **Privacy is resolved once, upstream, and applied automatically.** Route-group middleware sets
  `req.privacy: RequestPrivacy = { zeroDataRetention, mode, reduced }`; the responder reads it and
  applies the `reduced` projection to every response. The controller never constructs privacy or
  diagnostics. Only `reduced` changes behavior; `mode`/`zeroDataRetention` are reported metadata.
- **`forced-anon` vs `forced-zdr` is NOT a responder concern.** Both collapse to `reduced: true` in
  `resolvePrivacy`. The anon/zdr distinction is billing/routing only and stays in the existing
  search code.
- **No HTTP status override, ever.** Status is always `errorCodeToHttpStatus(code)`. Dynamic
  upstream/origin status goes in `details.statusCode` (e.g. `ScrapeError.SITE`,
  `AgentError.UPSTREAM`), never the HTTP line — so the playground's code↔status parity check is a
  true invariant.
- **Genuine raw pass-throughs are exempted by an inline marker comment**, not forced through the
  responder.
- **`r.step` — `name` is a free string, `status` is an enum.** `name` is defined at the call site
  (free-form, normalized to the controlled set, unknown → `"response"`); `details` stays
  `Record<string, unknown>` (the `reduced` projection at send is the protection, not the type). But
  `status` is a closed set, so convert `DiagnosticStatus` from a string union into an **enum**
  (`DiagnosticStatus.Ok = "ok"`, …) and use it at call sites: `r.step({ name: "browser", status:
DiagnosticStatus.Ok })`. Same treatment for `ResponseStatus`/`JobState` (enums; values unchanged
  on the wire) so no `"failed"`/`"warning"` literals appear in code — consistent with the
  `ErrorCodes` convention. The 5 `mode` values stay (still a small union; promote to an enum too if
  you want full consistency).

## Dependency graph

```
RA (resolvePrivacy + middleware + RequestPrivacy + req augmentation) ─┐
RB (makeResponder; drop httpStatus override) ─────────────────────────┼─> RC (migrate controllers;
                                                                       │      success types extend ResponseCore;
RD (2 new FeedbackError codes + catalog; WINDOW_EXPIRED→410) ─────────┘      delete helpers/jsonResponse)
                                                                            └─> RE (guard test + inline markers)
RF (serde parseErrorCode; rename WarningEntry→Warning) — independent, any time
```

RB needs RA's `RequestPrivacy`. RC needs RB+RD. RE needs RC. RF is independent.

---

## RA — `resolvePrivacy`, middleware, `RequestPrivacy`

**Goal:** resolve privacy once per request, attach to `req`, fixing the bare-`req` "mode:disabled"
bug (the old enveloper only honored privacy when handed an explicit ctx; most controllers passed a
bare `req` → always `disabled`).

Steps:

1. Promote `getPrivacyMode(zeroDataRetention, requestZeroDataRetention, forcedByTeam)` out of
   `controllers/v2/scrape.ts` + `parse.ts` (identical dupes) into `lib/zdr-helpers.ts`.
2. Add `RequestPrivacy = { zeroDataRetention: boolean; mode: PrivacyMode; reduced: boolean }`
   (`reduced = mode === "forced" || mode === "request"`). Define `resolvePrivacy` variants:
   - **scrape-group:** `getScrapeZDR(req.acuc?.flags)` + request `zeroDataRetention`/`lockdown`
     → `getPrivacyMode`.
   - **search-group:** `getSearchZDR(req.acuc?.flags)`; `forced-zdr` **and** `forced-anon` both →
     `mode:"forced"` (reduced). (Distinction handled elsewhere for billing.)
   - **content-free:** `mode:"not_applicable"`, `zeroDataRetention` from flags, `reduced:false`.
3. Mount the matching middleware per route group in `routes/v2.ts`, **after auth** (needs
   `req.acuc`) and before controllers. Augment Express `Request` with `privacy?: RequestPrivacy`.

Skeleton:

```ts
// lib/zdr-helpers.ts (promoted from scrape.ts/parse.ts dupes)
export function getPrivacyMode(
  zeroDataRetention: boolean,
  requestZeroDataRetention: boolean,
  forcedByTeam: boolean,
): PrivacyMode {
  if (forcedByTeam) return "forced";
  if (requestZeroDataRetention) return "request";
  return zeroDataRetention ? "allowed" : "disabled";
}

// controllers/v2/types.ts
export type RequestPrivacy = {
  zeroDataRetention: boolean;
  mode: PrivacyMode;
  reduced: boolean;
};
declare global {
  namespace Express {
    interface Request {
      privacy?: RequestPrivacy;
    }
  }
}

// middleware (one per route group; mounted after auth, before controllers)
const finish = (mode: PrivacyMode): RequestPrivacy => ({
  zeroDataRetention:
    mode === "forced" || mode === "request" || mode === "allowed",
  mode,
  reduced: mode === "forced" || mode === "request",
});

export const resolveScrapePrivacy: RequestHandler = (req, _res, next) => {
  const forcedByTeam = getScrapeZDR(req.acuc?.flags) === "forced";
  const requestZdr =
    (req.body?.zeroDataRetention ?? false) || (req.body?.lockdown ?? false);
  const zdr = forcedByTeam || requestZdr;
  req.privacy = finish(getPrivacyMode(zdr, requestZdr, forcedByTeam));
  next();
};

export const resolveSearchPrivacy: RequestHandler = (req, _res, next) => {
  // forced-zdr AND forced-anon both reduce; the billing distinction stays in the search code.
  const forced = getSearchZDR(req.acuc?.flags); // "disabled"|"allowed"|"forced-zdr"|"forced-anon"
  const mode: PrivacyMode =
    forced === "forced-zdr" || forced === "forced-anon"
      ? "forced"
      : forced === "allowed"
        ? "allowed"
        : "disabled";
  req.privacy = finish(mode);
  next();
};

export const resolveContentFreePrivacy: RequestHandler = (req, _res, next) => {
  // no scrape/search content is processed; reassure forced-ZDR teams the path is safe.
  req.privacy = {
    zeroDataRetention: getScrapeZDR(req.acuc?.flags) === "forced",
    mode: "not_applicable",
    reduced: false,
  };
  next();
};
```

**Verify:** `tsc` clean; a ZDR scrape request now yields `privacy.mode:"forced"`/`reduced:true`
where it previously showed `disabled`.

---

## RB — `makeResponder` (and drop the override)

**Goal:** the single send-style responder; remove `httpStatus` from the error path.

Steps:

1. In `controllers/v2/response-enveloper.ts`, add `makeResponder(req, res)`:
   - reads `req.privacy`; if unset (pre-auth/middleware-stage failures) defaults to
     `{ zeroDataRetention:false, mode:"disabled", reduced:false }` (those paths process no content,
     so nothing to strip).
   - holds a mutable `diagnostics` seeded from `req.privacy`.
   - `step(name, status, opts?)` → wraps existing `buildDiagnosticStep` (normalized name, gated
     `details`) and appends to the owned diagnostics.
   - `ok(body)` / `warn(body, warnings)` / `fail(code, msg, {details?})` /
     `asyncFail(code, msg, opts)` → build the envelope (auto-attach diagnostics + `reduced`
     projection), then `res.status(...).json(...)` and return the `Response`.
   - `fail`/`asyncFail` status = `errorCodeToHttpStatus(code)` **only**.
2. **Remove the `httpStatus` option** from `errorResponse`/`asyncJobFailureResponse` (or from the
   responder methods that replace them). Dynamic upstream status moves to `details.statusCode`.
3. Keep the existing pure builders only if still used by tests; otherwise fold into the responder.

Skeleton (reuses existing `buildDiagnosticStep`, `requestTraceId`, `statusForWarnings`,
`errorCodeToHttpStatus`; note `diagnostics` is owned + mutable so `step()` and the terminal methods
share one object):

```ts
const SAFE_DEFAULT_PRIVACY: RequestPrivacy = {
  zeroDataRetention: false,
  mode: "disabled",
  reduced: false,
};

type StepInput = Omit<DiagnosticStepInput, never>; // {name,status,code?,message?,messageTemplate?,details?,durationMs?,...}

export type Responder = {
  step(
    input: StepInput,
    target?: "steps" | "sources" | "actions",
    key?: string,
  ): void;
  ok<T extends Record<string, unknown>>(body: T): Response;
  warn<T extends Record<string, unknown>>(
    body: T,
    warnings: Warning[],
  ): Response;
  fail(code: ErrorCodes, error: string | Error, opts?: FailOpts): Response;
  asyncFail<TData = unknown>(
    code: ErrorCodes,
    error: string | Error,
    opts?: AsyncFailOpts<TData>,
  ): Response;
};

export function makeResponder(req: Request, res: Response): Responder {
  const privacy = req.privacy ?? SAFE_DEFAULT_PRIVACY;
  const traceId = privacy.reduced ? undefined : requestTraceId(req);
  const diagnostics: Diagnostics = { privacy, ...(traceId ? { traceId } : {}) };

  const step: Responder["step"] = (input, target = "steps", key) => {
    const s = buildDiagnosticStep(input, privacy); // drops details/raw message when privacy.reduced
    if (target === "sources") {
      diagnostics.sources = {
        ...(diagnostics.sources ?? {}),
        [key ?? s.name]: s,
      };
    } else {
      diagnostics[target] = [...(diagnostics[target] ?? []), s];
    }
  };

  const send = (httpStatus: number, body: unknown) =>
    res.status(httpStatus).json(body);
  const msg = (e: string | Error) => (typeof e === "string" ? e : e.message);
  const failBody = (
    code: ErrorCodes,
    error: string | Error,
    opts: FailOpts = {},
  ) => ({
    success: false as const,
    status: "failed" as const,
    code,
    error: msg(error),
    diagnostics,
    ...(opts.details !== undefined ? { details: opts.details } : {}),
    ...(opts.errorId ? { errorId: opts.errorId } : {}),
    ...(opts.sponsor_status ? { sponsor_status: opts.sponsor_status } : {}),
    ...(opts.login_url ? { login_url: opts.login_url } : {}),
  });

  return {
    step,
    ok(body) {
      const warning =
        typeof body.warning === "string" ? body.warning : undefined;
      const warnings = Array.isArray(body.warnings)
        ? (body.warnings as Warning[])
        : undefined;
      return send(200, {
        ...body,
        success: true,
        status: statusForWarnings(warning, warnings),
        diagnostics,
      });
    },
    warn(body, warnings) {
      return send(200, {
        ...body,
        success: true,
        status: "warning",
        warnings,
        diagnostics,
      });
    },
    fail(code, error, opts) {
      return send(errorCodeToHttpStatus(code), failBody(code, error, opts)); // status: catalog ONLY
    },
    asyncFail(code, error, opts = {}) {
      return send(200, {
        ...failBody(code, error, opts),
        jobState: "failed" as const,
        ...(opts.data !== undefined ? { data: opts.data } : {}),
        ...(opts.failureCount !== undefined
          ? { failureCount: opts.failureCount }
          : {}),
        ...(opts.failuresByCode ? { failuresByCode: opts.failuresByCode } : {}),
        // …remaining async metadata (creditsUsed/expiresAt/createdAt/completedAt/duration)
      });
    },
  };
}
```

Note there is **no `httpStatus` in `FailOpts`** — that's the #1 fix. Dynamic upstream status lives in
`opts.details.statusCode`.

**Verify:** responder unit tests (below) pass; status always equals the catalog value.

### RB — test skeleton

Send-style means asserting on a mocked `res`. A small helper captures what was sent:

```ts
import { makeResponder } from "../response-enveloper";
import { errorCodeToHttpStatus } from "../../../lib/error-catalog";
import { ScrapeError, FeedbackError } from "../../../lib/error-codes";
import type { RequestPrivacy } from "../types";

function mockRes() {
  const sent = { status: 0 as number, body: undefined as any };
  const res: any = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: any) {
      sent.body = body;
      return res;
    },
  };
  return { res, sent };
}
const reqWith = (privacy?: RequestPrivacy): any => ({
  privacy,
  header: () => undefined,
});

describe("makeResponder", () => {
  it("derives HTTP status from the catalog, never an override", () => {
    const { res, sent } = mockRes();
    makeResponder(reqWith(), res).fail(ScrapeError.TIMEOUT, "timed out");
    expect(sent.status).toBe(errorCodeToHttpStatus(ScrapeError.TIMEOUT)); // 408
    expect(sent.body).toMatchObject({
      success: false,
      status: "failed",
      code: ScrapeError.TIMEOUT,
    });
  });

  it("defaults to safe privacy when req.privacy is unset (pre-auth)", () => {
    const { res, sent } = mockRes();
    makeResponder(reqWith(undefined), res).fail(
      FeedbackError.DB_UNAVAILABLE,
      "db down",
    );
    expect(sent.body.diagnostics.privacy).toEqual({
      zeroDataRetention: false,
      mode: "disabled",
      reduced: false,
    });
  });

  it("strips step details + raw message under reduced privacy", () => {
    const { res, sent } = mockRes();
    const r = makeResponder(
      reqWith({ zeroDataRetention: true, mode: "forced", reduced: true }),
      res,
    );
    r.step({
      name: "scrape",
      status: "failed",
      message: "https://secret.example/path",
      messageTemplate: "scrape failed",
      details: { url: "https://secret.example/path" },
    });
    r.fail(ScrapeError.SITE, "site error");
    const s = sent.body.diagnostics.steps[0];
    expect(s.details).toBeUndefined();
    expect(s.message).toBe("scrape failed"); // template kept, raw dropped
  });

  it("ok() flips to status:'warning' when warnings present; warn() always does", () => {
    const { res, sent } = mockRes();
    makeResponder(reqWith(), res).ok({
      data: {},
      warnings: [{ code: "X", message: "m" } as any],
    });
    expect(sent.body.status).toBe("warning");
  });

  it("accumulated steps appear on the terminal response", () => {
    const { res, sent } = mockRes();
    const r = makeResponder(reqWith(), res);
    r.step({ name: "auth", status: "ok" });
    r.step({ name: "scrape", status: "ok" });
    r.ok({ data: {} });
    expect(sent.body.diagnostics.steps).toHaveLength(2);
  });
});
```

---

## RC — migrate controllers; enforce the envelope on success

**Goal:** every v2 controller + `routes/shared.ts` guard uses `makeResponder`; success responses are
compiler-required to carry the envelope.

Steps:

1. **Success types extend `ResponseCore`.** In `controllers/v2/types.ts`, make the `success:true`
   arms of `ScrapeResponse`, `SearchResponse`, and every other client-facing v2 response type
   `& ResponseCore` (requiring `status`+`diagnostics`); async-status types additionally carry
   `jobState`. A bare `{success:true,data}` now fails to compile.
2. **Delete** the six per-controller helpers and both `jsonResponse` shims; replace every call with
   `const r = makeResponder(req, res)` + `r.ok/r.warn/r.fail/r.asyncFail`. `routes/shared.ts`
   guards use `makeResponder` too (privacy defaults safely pre-auth).
3. Remove all literal `httpStatus:` arguments (now gone from the API); let the code drive status.
4. Move dynamic upstream statuses into `details` (`ScrapeError.SITE.statusCode`,
   `AgentError.UPSTREAM.status`).

**Verify:** `tsc` clean (success sites missing the envelope now error and must be fixed); touched-
controller snips green.

### RC — interact (`scrape-browser.ts`) migration notes

Posture: scrape-family content → `resolveScrapePrivacy` middleware (fixes the current bare-`req`
bug where interact errors report `mode:"disabled"` despite the locally-computed `zdrForced`).
`const r = makeResponder(req, res)` at the top; every `errorResponse(...) + res.status().json()`
pair becomes `return r.fail(code, …)`; record `r.step({ name, status: DiagnosticStatus.* })` for
job → browser → action.

Two **deliberate behavior changes** vs `db9d4528` (comment each at the site):

1. **Exec threw** (browser-service call failed — the two catch blocks): was **502**; the landed
   refactor wrongly used `BrowserError.EXECUTION_FAILED` (422). Correct it to
   `DependencyError.UNAVAILABLE` → **502**, `details.dependency:"browser-service"` (upstream
   failure, not the caller's fault). Net: restores the original 502 with an honest code.
2. **Exec ran, non-zero exit / killed** (was HTTP **200** + `success:false` + full body + no
   `code`): becomes `r.fail(BrowserError.EXECUTION_FAILED, stderr || "Execution failed",
{ details: { exitCode, killed } })` → **422**. Add a comment:
   `// CHANGED: previously returned 200 + success:false with no code; now 422 + EXECUTION_FAILED.`
   Note this drops top-level `liveViewUrl`/`stdout`/`result`/`stderr` from the failed response
   (they aren't part of the error envelope); `exitCode`/`killed` ride in `details`. If a failed
   exec must still expose the live-view URL or stdout, extend the `EXECUTION_FAILED` details shape
   in `lib/error-details.ts` — flagged, not assumed.

Unchanged: replay-context-unavailable stays `EXECUTION_FAILED`/422 (an unprocessable scrape-state
case, not a dependency failure). Success path (exit 0) → `r.ok({ liveViewUrl,
interactiveLiveViewUrl, output?, stdout, result })`. The DELETE controller's bare
`res.status(200).json({ success: true })` and final billed-success → `r.ok(...)`; its two session
errors → `r.fail(BrowserError.SESSION_NOT_FOUND | SESSION_FORBIDDEN, …)`.

---

## RD — feedback codes

Steps:

1. Add to `lib/error-codes.ts` `enum FeedbackError`: `PREVIEW_UNAVAILABLE = "FEEDBACK_PREVIEW_UNAVAILABLE"`
   and `JOB_NOT_SUCCESSFUL = "FEEDBACK_JOB_NOT_SUCCESSFUL"`.
2. Add `ERROR_CATALOG` entries (required by the `satisfies Record<…>` completeness check), no
   `details`:
   - `PREVIEW_UNAVAILABLE` → **403**
   - `JOB_NOT_SUCCESSFUL` → **409**
3. In `controllers/v2/feedback/record.ts`: preview-team rejection uses `PREVIEW_UNAVAILABLE` (was
   `RequestError.BAD_REQUEST` forced 403); "did not succeed" uses `JOB_NOT_SUCCESSFUL` (was
   `CommonError.UNKNOWN` forced 409); `WINDOW_EXPIRED` drops its override → catalog **410** (Gone;
   deliberate change from the old forced 409).

**Verify:** feedback snips assert the new codes + `errorCodeToHttpStatus` (403/409/410).

---

## RE — guard test + raw-response markers

Steps:

1. Extend the AST guard (`__tests__/guards/errorcodes-regression.test.ts` pattern): flag
   `res.json(...)`, `res.status(...).json(...)`, and `res.send(<body>)` in `controllers/v2/` +
   `routes/shared.ts`, **except** in `response-enveloper.ts` and lines carrying a
   `// raw-response: <reason>` marker.
2. Mark the genuine pass-throughs: `support-proxy.ts:62` and `research-proxy.ts:334` (streaming
   upstream bodies verbatim).

**Verify:** guard passes; deliberately adding a bare `res.json` in a controller fails it.

---

## RF — serde + rename (independent)

Steps:

1. `lib/error-serde.ts` `deserializeTransportableError`: replace `errorMap[code as ErrorCodes]`
   with `const parsed = parseErrorCode(code); if (!parsed) return null;` then `errorMap[parsed]`
   (unknown wire code → `null`, behavior unchanged).
2. Rename envelope type `WarningEntry` → `Warning` in `controllers/v2/types.ts` and all references
   (response-enveloper, controllers). Catalog's `WarningCatalogEntry` is already distinct — no
   collision.

**Verify:** `tsc` clean; serde round-trip snip still green.

---

## Tests

- Responder unit tests: status always catalog-derived; `reduced` strips `details`/raw `message`;
  pre-auth default privacy; `warn`/warnings force `status:"warning"`.
- Privacy: scrape/search ZDR requests → `privacy.reduced:true`; content-free → `not_applicable`.
- Feedback: 403 `PREVIEW_UNAVAILABLE`, 409 `JOB_NOT_SUCCESSFUL`, 410 `WINDOW_EXPIRED`.
- Guard: bare `res.json` in a v2 controller fails; marked pass-throughs pass.
- Gate fire-engine/AI cases per CLAUDE.md; use `scrapeTimeout` from `./lib`.
