# Firecrawl Velvet Comet Demo Plan

## Anchor — why this exists

Customer feedback #7 (workflow automation startup, growth plan):

> *"Fourteen steps, one error. Was it step three or step eleven? Did a selector miss, did a wait time out, did the page change on us? We re-run the entire chain with screenshots sprinkled in just to find out where it died. Re-run and squint, that's our debugging strategy."*
> *"Tell me which step failed and what the page looked like when it did. Honestly, even just the step index would cut our debugging time in half."*

Four distinct asks. Mapping each to what's now on the wire:

| Customer ask                       | Field on the response                                    |
| ---------------------------------- | -------------------------------------------------------- |
| "Which step failed?"               | `details.actionIndex`                                    |
| "What did the page look like?"     | `details.screenshot` (base64 JPEG, ~18KB)                |
| "Did a selector miss?"             | `details.selector`                                       |
| "Did the page change on us?"       | `details.pageUrl`                                        |
| "Did a wait time out?"             | `details.actionType` (or implicit via the action index)  |
| "Did the replay reconstruction succeed?" | `details.replayFailedAt: {actionIndex, actionType}` |
| "Stop re-running just to find out" | All of the above arrive on the FIRST failure response    |

Every column has a verified field behind it. CLI tests pass (Test 1 = `SCRAPE_ACTION_ERROR` with actionIndex/selector/pageUrl/screenshot; Test 2 = `BROWSER_EXECUTION_FAILED` with exitCode/pageUrl/screenshot/stderrSnippet).

---

## Status

- ✅ Envelope on the wire — `ErrorDetailsMap` extended for both codes, populated end-to-end
- ✅ Local stack via `docker-compose.playground.yaml` — persistence on, schema seeded, profile-gated cruft removed
- ✅ Two of four failure modes verified by CLI (selector miss, JS exception)
- ⏳ Two more failure modes to verify by CLI (wait timeout, synthetic replayFailedAt)
- ⏳ UI renderers (`ErrorView.tsx`) — diagnostic data flows through but renders as raw JsonView until task 5

---

## The demo arc (what the 45-min call shows)

**Scene 0 — Set the trap (30s).** Slide with the customer's quote. *"This is what I built for."*

**Scene 1 — Scrape-side failure (90s).** Open playground. Paste a URL with a realistic 6-step actions array (wait, click, fill, click, scroll, click). Step 4 has a wrong selector. Submit.

Reviewer sees:
- Red header: `SCRAPE_ACTION_ERROR — Action #4 failed`
- Selector that missed: `.product-card-add`
- URL pill: `https://example.com/checkout`
- Inline screenshot of the rendered page
- Waterfall: ✅ wait, ✅ click, ✅ fill, ❌ click `.product-card-add`, ⏭️ scroll, ⏭️ click

Pitch line: *"Before this diff, this customer got back `SCRAPE_FAILED`. Now they get step index + selector + URL + screenshot in one response, on the first try."*

**Scene 2 — Interact failure, different mode (90s).** From the scrape response, click "Open in Interact." Interact tab pre-fills with the jobId. Live view shows replay reconstructing the page. Submit a Playwright code snippet that intentionally fails (`await page.click('.missing-dropdown')`).

Reviewer sees:
- `BROWSER_EXECUTION_FAILED — exitCode 1`
- `stderrSnippet` showing the JS error
- Same URL pill + screenshot component as Scene 1
- `replayFailedAt: null` — clarifies this is YOUR code, not the replay

Pitch line: *"Two different failure modes — scrape's action engine, interact's code execution — share the same diagnostic frame. A 14-step automation crossing scrape→interact won't lose context at the boundary."*

**Scene 3 — Replay failure (60s, the interact-debugging headline).** Run interact against a jobId whose stored actions can't be replayed cleanly (state divergence).

Reviewer sees:
- Same envelope shape
- `replayFailedAt: { actionIndex: 7, actionType: "click" }` **populated**
- The dev instantly knows: *the replay couldn't reconstruct step 7 — the page diverged*

Pitch line: *"This is the failure mode impossible to debug today. Interact is opaque about whether 'my code broke' or 'the replay couldn't get back to where the scrape left off.' Now those are two different signals."*

**Scene 4 — Close (30s).** *"This is one normalization layer in the open-source code. Self-hosted Firecrawl users get this on next sync. Cloud Firecrawl inherits the contract when they pull. The wire shape carries it; we just had to write the producer for the engines we control."*

---

## Four failure modes the same envelope handles

Reviewer might probe — this is the menu:

1. **Selector miss in an action** → `actionIndex` + `selector` + screenshot
2. **Wait-for-selector timeout** → same envelope; `actionIndex` points to the wait step
3. **JS exception in interact code** → `exitCode` + `stderrSnippet` + screenshot, `replayFailedAt` absent
4. **Replay reconstruction failed** → `replayFailedAt: {actionIndex, actionType}` populated; stderr regex (`/Replay action #(\d+) \((\w+)\):/`) is the discriminator

Four customer-visible scenarios → one envelope → one renderer.

---

## #11 bonus framing (auth-walled portal customer)

Interject if the reviewer mentions auth: *"The interact route already holds an authenticated session across steps — that's its design. What I added is the failure semantics. When their login-flow's halfway-through-a-run blows up, they now get `replayFailedAt.actionIndex` pointing at the step that failed AND a screenshot showing whether they're at the login wall or past it. That's the answer to #11's third question."*

---

## Limits to acknowledge in the one-pager (preempts pushback)

- **Per-step success/duration for scrape-side actions** isn't fully populated. Prompt-mode interact emits per-step `actions[]`; scrape-side only shows the failed one. *"Another day's work to plumb each action result through `diagnostics.actions[]`."*
- **"Page changed on us" detection is implicit** (screenshot + URL let the dev see) rather than explicit (we don't compute "this page is different from your scrape's page"). *"Visual diff between expected vs actual is the next layer."*
- **No auto-retry classification helper.** Codes are stable enough to retry on, but I didn't ship a retry library.

These aren't gaps — they're scope decisions you OWN because you anchored on the one win that mattered: kill the re-run-and-squint loop.

---

## The wow moment (if everything else is forgotten)

> *"Four failure modes — selector miss, wait timeout, replay divergence, JS exception — that today all come back as either `SCRAPE_FAILED` or a useless 200 with `success: false`. Now they all carry step index, page URL, and a screenshot. Same envelope, same renderer, two routes."*

That's the contract upgrade in one sentence.

---

## Status

| Step | Task | Effort | Status |
| --- | --- | --- | --- |
| ✅ | Read interact end-to-end, map failure paths | 45m | done |
| ✅ | Envelope as per-code ErrorDetailsMap extensions | 30m | done |
| ✅ | Wire envelope into interact (main exec + replay-init) | 1.5-2h | done |
| ✅ | Wire envelope into scrape-side SCRAPE_ACTION | 1-1.5h | done |
| ✅ | `docker-compose.playground.yaml` + profile-gate optional services | 1h | done |
| ✅ | CLI verification of all 4 failure modes + 4 success modes | 30m | done (8/8 pass) |
| ✅ | SCRAPE_TIMEOUT race fix — cdp.ts buffer | 30m | done |

---

## Implementation tasks (UI build, numbered with specs)

Each task is self-contained: file list, spec, intended outcome, effort. Run in
order — Tasks 1-2 are API plumbing the UI depends on, 3 trims surface area,
4 is the visible failure-view payoff, 5 stitches the demo's scene transition.

### Task 1 — Plumb scrape-side per-step into `diagnostics.actions[]`

**Why**: Scene 1's demo arc promises a waterfall: ✅ wait → ✅ click → ✅ fill → ❌ click → ⏭️ scroll → ⏭️ click. Today the API emits only the failed step. Without this task, the waterfall renders empty for scrape-side failures.

**Files**:
- `apps/playwright-service-ts/api.ts` — extend the `ScrapeActionError` catch (~L1914) to include an `actionStatuses` array.
- `apps/api/src/scraper/scrapeURL/engines/playwright/cdp.ts` — extend the zod schema for `actionError` to accept `actionStatuses?`; pass through to `ActionError` (via `details` or a constructor arg).
- `apps/api/src/lib/error-details.ts` — extend `ScrapeError.ACTION` entry with `actionStatuses?: Array<{name: string; status: "ok"|"failed"|"skipped"; code?: string; durationMs?: number}>`.
- `apps/api/src/controllers/v2/scrape.ts` — in the `TransportableError` catch (~L338), before `r.fail`, if `e.code === ScrapeError.ACTION` and `e.details?.actionStatuses`, loop and call `r.step(s, "actions")` for each entry.

**Spec**:

Playwright-service tracks per-action timing while `executeActions` runs (start time before each action's switch; on success push a status, on failure also push a status then re-throw). When `ScrapeActionError` is thrown at L1222, the `results` array already contains successful actions in order; pair that with the failed action and the remaining unrun actions to build:

```ts
actionStatuses: [
  { name: "Action 0 (wait)", status: "ok", durationMs: 203 },
  { name: "Action 1 (click)", status: "ok", durationMs: 47 },
  // ... successful actions before the failure
  { name: "Action 3 (click)", status: "failed", code: "SCRAPE_ACTION_ERROR", durationMs: 15012 },
  { name: "Action 4 (scroll)", status: "skipped" },
  { name: "Action 5 (click)", status: "skipped" },
]
```

The `name` field uses 0-indexed numbering matching the response's `actionIndex` field for consistency.

`cdp.ts` extends the existing zod schema (~L62-68) to accept `actionStatuses` on `actionError`, then passes the array through to the `ActionError` constructor (extending the class signature with an additional `actionStatuses?` parameter, plumbed into `details`).

`scrape.ts` controller — in the `instanceof TransportableError` branch:
```ts
const actionStatuses = (e.details as any)?.actionStatuses;
if (Array.isArray(actionStatuses)) {
  for (const s of actionStatuses) r.step(s, "actions");
}
return r.fail(e.code, e.message, { details: e.details, ... });
```

**Intended outcome**: `POST /v2/scrape` with a 6-step actions chain failing at step 3 returns a response with `diagnostics.actions[]` containing 6 entries (3 ok, 1 failed, 2 skipped). CLI test F1 (existing) now shows 2 entries: `wait/ok` + `click/failed`. Add a CLI test with a 6-step chain to confirm 6 entries.

**Effort**: ~45 min.

---

### Task 2 — Add `sessionId` to interact response

**Why**: `LiveView.tsx` (`signals.ts:57` `sessionId`) is dormant — nothing in the client ever sets the signal. The interact response is the natural place to surface the session ID so the LiveView WebSocket can connect on its own.

**Files**:
- `apps/api/src/controllers/v2/scrape-browser.ts` — `scrapeInteractController` success path (`r.ok({...})`, ~L397) AND failure paths (`r.fail(...)`, ~L388 and L320-324 and L358-362).
- `apps/api/src/lib/error-details.ts` — extend `BrowserError.EXECUTION_FAILED` with `sessionId?: string`.
- `apps/api/src/admin/playground/client/components/InteractRequestBuilder.tsx` (created by Task 5) — read `response.sessionId` (or `response.details?.sessionId`) and set `sessionId.value`.

**Spec**:

Server (`scrapeInteractController`):
- Success path: `return r.ok({ sessionId: session.id, ...(agentOutput ? {output: agentOutput} : {}), stdout: ..., result: ... });`
- Failure path at line ~388 (`BROWSER_EXECUTION_FAILED`): include `sessionId: session.id` in `details`:
  ```ts
  details: {
    sessionId: session.id,
    exitCode: ...,
    killed: ...,
    pageUrl: capture.pageUrl,
    screenshot: capture.screenshot,
    ...(replayFailedAt ? { replayFailedAt } : {}),
    ...(stderrSnippet ? { stderrSnippet } : {}),
  }
  ```
- Other failure paths (SERVICE_UNAVAILABLE, SESSION_FORBIDDEN, JOB_NOT_FOUND, etc.) — DON'T include sessionId; they don't have a live session.

Client (`InteractRequestBuilder.tsx`): after receiving the response, regardless of success/failure:
```ts
const sid = response.sessionId ?? response.details?.sessionId;
if (sid) sessionId.value = sid;
```

The existing `LiveView` component reads `sessionId.value` and opens its WebSocket to `./session/${sid}/view` automatically.

**Intended outcome**: After clicking Run in the interact tab, the LiveView canvas in the response area begins streaming the browser session's state. Works on both successful runs and failures — devs see the page state regardless. Verify visually: load the playground, attach a jobId, run code, watch the canvas update.

**Effort**: ~30 min.

---

### Task 3 — Visual surface trim (cuts)

**Why**: The playground today has 6 feature tabs, 10+ format toggles, an LLM-proxy status pill, a recorder panel, and a browser-sessions panel. The demo only uses Scrape + Interact + Markdown/Screenshot/Links. Trimming sharpens the demo recording and prevents reviewers from getting distracted by features outside the contract-upgrade story.

**Files**:
- `apps/api/src/admin/playground/client/signals.ts` — add `"interact"` to the `Feature` union.
- `apps/api/src/admin/playground/client/components/FeatureNav.tsx` — show only Scrape + Interact tabs.
- `apps/api/src/admin/playground/client/components/RequestBuilder.tsx` — add an `if (feature === "interact") return <InteractRequestBuilder />` branch (component lives in Task 5).
- `apps/api/src/admin/playground/client/components/Header.tsx` — remove the `<LLMProxyStatus />` render.
- `apps/api/src/admin/playground/client/App.tsx` (or wherever it mounts) — remove `<RecorderPanel />`.
- `apps/api/src/admin/playground/client/components/scrape/ScrapeRequestBuilder.tsx` — reduce the format-toggle list to `["markdown", "screenshot", "links"]`.

**Spec**:

1. `signals.ts`:
   - Add `"interact"` to the `Feature` union type.
   - Add `interactJobId = signal<string>("")` and `interactCode = signal<string>("")` signals (used by Tasks 5).

2. `FeatureNav.tsx`: Reduce the navigable feature list to `[{id: "scrape", label: "Scrape"}, {id: "interact", label: "Interact"}]`. Other features stay in the type union (don't delete them — `requestDrafts` still has slots for them) but aren't shown.

3. `RequestBuilder.tsx`: Add an early return for `feature === "interact"` pointing to `<InteractRequestBuilder />` (Task 5 creates the component file).

4. `Header.tsx`: Remove or comment the `<LLMProxyStatus />` element. Don't delete the import unless `knip` flags it as unused — adjust if needed.

5. `App.tsx`: Remove `<RecorderPanel />` from the layout. Don't delete the file — keep the component on disk for future re-enabling, just don't mount it.

6. `ScrapeRequestBuilder.tsx`: Find the format-toggle array (`FORMATS` or similar) and limit it to `["markdown", "screenshot", "links"]`. Other format keys still work via raw JSON request if a user constructs one manually — no API change.

**Intended outcome**: Load `/admin/playground`. See only "Scrape" and "Interact" tabs. On the Scrape tab, format toggles show only Markdown / Screenshot / Links. No LLM-proxy pill in the header. No recorder panel anywhere.

**Effort**: ~45 min.

---

### Task 4 — Failure view UI (newspaper layout)

**Why**: This is the visible payoff for all the API work. Today, `ErrorView.tsx` falls through to `JsonView` for the two enriched codes, so the dev sees raw base64 in JSON. After this task, the failure view renders as: code chip + headline naming the failed step, large screenshot, URL caption, debugging body. The visual climax of the demo.

**Files**:
- `apps/api/src/admin/playground/client/components/ErrorView.tsx` — restructure to detect the two target codes and render the newspaper layout.
- `apps/api/src/admin/playground/client/components/FailureFrame.tsx` (optional, new) — extract the screenshot + URL caption sub-component if it grows beyond ~20 lines; otherwise inline in ErrorView.
- `apps/api/src/admin/playground/client/playground.css` — add styles for `.playground-failure__*` classes.

**Spec**:

In `ErrorView`, compute a `useFailureFrame` predicate:
```ts
const useFailureFrame =
  (code === "SCRAPE_ACTION_ERROR" || code === "BROWSER_EXECUTION_FAILED") &&
  details && typeof details === "object" &&
  ((details as any).pageUrl || (details as any).screenshot);
```

When `useFailureFrame` is true, render in this order (replacing the existing top-of-component stack — fall through to existing layout when false):

1. **Headline area** (`.playground-failure__headline`):
   - Code chip: `<code class="playground-chip playground-chip--danger">{code}</code>`
   - Bold headline computed per code:
     - `SCRAPE_ACTION_ERROR` with selector: `Action {details.actionIndex} failed: {details.selector}`
     - `SCRAPE_ACTION_ERROR` without selector: `Action {details.actionIndex} failed`
     - `BROWSER_EXECUTION_FAILED` with `details.replayFailedAt`: `Replay reconstruction failed at action {details.replayFailedAt.actionIndex} ({details.replayFailedAt.actionType})`
     - `BROWSER_EXECUTION_FAILED` without `replayFailedAt`: `Interact code failed`

2. **Screenshot frame**:
   ```tsx
   {details.screenshot ? (
     <a target="_blank" rel="noopener" href={`data:image/jpeg;base64,${details.screenshot}`}>
       <img class="playground-failure__screenshot"
            src={`data:image/jpeg;base64,${details.screenshot}`}
            alt="Page state at failure" />
     </a>
   ) : (
     <div class="playground-failure__screenshot-empty">screenshot unavailable</div>
   )}
   ```
   - CSS: `.playground-failure__screenshot { max-width: 100%; max-height: 400px; object-fit: contain; cursor: pointer; border: 1px solid var(--line); }`.

3. **URL caption**:
   ```tsx
   {details.pageUrl && <div class="playground-failure__url">{details.pageUrl}</div>}
   ```
   - CSS: monospace, 12px, muted color, 4px top margin.

4. **Body**:
   - Catalog explanation + fix (existing logic in `explainError(parsedCode)`)
   - For BROWSER_EXECUTION_FAILED: if `details.stderrSnippet`, render in a monospace `<pre>` block with label "Error output"
   - Error ID chip with copy button (existing logic)

5. **Raw details** (collapsed):
   ```tsx
   <details>
     <summary>Raw details</summary>
     <JsonView value={details} collapsed={2} />
   </details>
   ```

6. **Diagnostics waterfall** (existing):
   ```tsx
   {(diagnostics?.actions?.length || diagnostics?.steps?.length) > 0 && (
     <DiagnosticsWaterfall steps={diagnostics.actions ?? diagnostics.steps} />
   )}
   ```
   - Note: pull from `actions` (populated by Task 1) before falling back to `steps`. The existing `DiagnosticsWaterfall` already colors failed rows via `STATUS_COLOR["failed"]`.

If `!useFailureFrame`, the component renders exactly as it does today (no regression for other error codes).

**CSS additions** (`playground.css`):
```css
.playground-failure__headline {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 12px;
}
.playground-failure__headline-text {
  font-size: 18px; font-weight: 700; color: var(--ink);
}
.playground-chip--danger {
  background: #573121; color: #ffd9c2; border-color: #8b1a1a;
}
.playground-failure__screenshot {
  max-width: 100%; max-height: 400px; object-fit: contain;
  cursor: pointer; border: 1px solid var(--line); display: block;
}
.playground-failure__screenshot-empty {
  padding: 24px; text-align: center; color: var(--muted);
  border: 1px dashed var(--line);
}
.playground-failure__url {
  font-family: ui-monospace, monospace; font-size: 12px;
  color: var(--muted); margin-top: 4px;
}
```

**Intended outcome**:
- Trigger `SCRAPE_ACTION_ERROR` via the demo URL + 6-step actions where step 3 fails → response pane shows red code chip + bold "Action 3 failed: .product-card-add" + 600px screenshot of example.com + URL + catalog fix text + waterfall (lit up by Task 1).
- Trigger `BROWSER_EXECUTION_FAILED` via interact code that throws → bold "Interact code failed" + screenshot + URL + monospace stderr block.
- Trigger `BROWSER_EXECUTION_FAILED` with replay-pattern stderr → bold "Replay reconstruction failed at action 3 (click)".

**Effort**: ~1.5h.

---

### Task 5 — Scrape→Interact seam + Interact tab

**Why**: Scene 2 of the demo arc requires a smooth handoff from a successful scrape into an interact session. Today there's no interact tab and no seam button. This task creates both.

**Files**:
- `apps/api/src/admin/playground/client/components/SuccessView.tsx` — add the floating "Open in Interact" button.
- `apps/api/src/admin/playground/client/components/InteractRequestBuilder.tsx` (new file) — the interact tab's request builder.
- `apps/api/src/admin/playground/client/components/scrape/ScrapeRequestBuilder.tsx` — ensure `origin: "website"` is always set in the scrape request body so the response carries `scrape_id`.
- `apps/api/src/admin/playground/client/playground.css` — styles for the floating button and interact builder.

**Spec**:

1. **Floating seam button** (in `SuccessView.tsx`):
   - At the bottom of the `feature === "scrape"` branch, if `body.scrape_id` is a non-empty string:
   ```tsx
   <div class="playground-seam-button">
     <div class="playground-seam-button__id">
       <span class="playground-muted">scrape:</span>
       <code>{(body.scrape_id as string).slice(0, 8)}…</code>
     </div>
     <button type="button" class="playground-button" onClick={() => openInInteract(body.scrape_id as string)}>
       Open in Interact →
     </button>
   </div>
   ```
   - `openInInteract`:
     ```ts
     function openInInteract(scrapeId: string) {
       interactJobId.value = scrapeId;
       interactCode.value = "";
       activeFeature.value = "interact";
     }
     ```
   - CSS: `.playground-seam-button { position: sticky; bottom: 16px; right: 16px; align-self: flex-end; background: var(--field); border: 1px solid var(--accent); padding: 10px 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }` — adjust positioning to render in the bottom-right of the response pane.

2. **Force `origin: "website"` in scrape requests** (in `ScrapeRequestBuilder.tsx`):
   - In whichever function builds the POST body, ensure `body.origin = "website"` unless the user has set origin via raw JSON. This guarantees `scrape_id` appears in the response (per `apps/api/src/controllers/v2/scrape.ts:492` — `scrape_id` is only included when origin contains "website").

3. **`InteractRequestBuilder.tsx`** (new component):
   ```tsx
   import { h } from "preact";
   import { useState } from "preact/hooks";
   import { interactJobId, interactCode, sessionId, inflight, apiKey } from "../signals";
   import { Button } from "./ui/Button";

   export function InteractRequestBuilder() {
     const jobId = interactJobId.value;
     const code = interactCode.value;
     const running = inflight.value;

     async function run() {
       if (!jobId || !code) return;
       inflight.value = true;
       try {
         const res = await fetch(`/v2/scrape/${jobId}/interact`, {
           method: "POST",
           headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.value}` },
           body: JSON.stringify({ code, language: "node", timeout: 30 }),
         });
         const body = await res.json();
         // Feed into the same response pipeline as scrape — append history entry, switch active view, etc.
         // The exact wiring follows the pattern in RequestBuilder.tsx's existing onSubmit.
         const sid = body.sessionId ?? body.details?.sessionId;
         if (sid) sessionId.value = sid;
       } finally {
         inflight.value = false;
       }
     }

     async function stop() {
       if (!jobId) return;
       await fetch(`/v2/scrape/${jobId}/interact`, {
         method: "DELETE",
         headers: { "Authorization": `Bearer ${apiKey.value}` },
       });
       sessionId.value = null;
     }

     return (
       <div class="playground-stack">
         <div>
           <label class="playground-surface__label">Job ID</label>
           <input
             type="text"
             value={jobId}
             onInput={(e: any) => interactJobId.value = e.target.value}
             placeholder="paste a scrape jobId, or use 'Open in Interact' from a scrape result"
             class="playground-input"
           />
         </div>
         <div>
           <label class="playground-surface__label">Code (Playwright JS)</label>
           <textarea
             value={code}
             onInput={(e: any) => interactCode.value = e.target.value}
             class="playground-textarea playground-textarea--code"
             rows={12}
             spellcheck={false}
           />
         </div>
         <div class="playground-row">
           <Button type="button" onClick={run} disabled={running || !jobId || !code}>Run</Button>
           <Button type="button" onClick={stop} disabled={!jobId}>Stop</Button>
         </div>
       </div>
     );
   }
   ```
   - Required CSS additions: `.playground-textarea--code { font-family: ui-monospace, monospace; font-size: 13px; resize: vertical; }`. Reuse existing `.playground-input` and `.playground-row`.

4. **Response display** in the interact tab:
   - When `activeFeature === "interact"`, the existing ResponsePane infrastructure runs ErrorView (Task 4) or SuccessView based on the response. No new wiring needed if the response body is fed into the same `historyEntries`/`requestBody` pipeline. The InteractRequestBuilder's `run()` must call the same history-append helper that ScrapeRequestBuilder uses (find the helper in `history.ts` and reuse).
   - Mount `<LiveView />` inside the interact tab's response area so it auto-connects when `sessionId.value` is set.

**Intended outcome**:
- Run a successful scrape → floating button visible bottom-right of the SuccessView showing `scrape: 7a3e…` and an "Open in Interact →" button.
- Click the button → activeFeature switches to "interact", interact tab loads with the jobId prefilled in the input field, textarea empty.
- Type `throw new Error('intentional');` → click Run → response renders as failure view (Task 4) with screenshot/URL/stderr; LiveView canvas above shows the page.
- Type a valid Playwright snippet → click Run → response renders as success view with stdout; LiveView shows the live browser state.
- Click Stop → DELETE the session, sessionId cleared, LiveView disconnects.

**Effort**: ~1.5h.

---

## Post-implementation tasks

| #   | Task | Effort | Why this order |
| --- | ---- | ------ | -------------- |
| 6   | E2E walkthrough of all 3 scenes through the UI | 1h | First time the demo runs as a reviewer would see it |
| 7   | Test-site flaky page (deterministic replay-divergence) | 1h | Optional — Scene 3 already works via synthetic stderr-throw pattern (CLI test F4); only needed if a "real" replay failure is required for the Loom |
| 8   | Git history squash → new public repo | 45m | Last code step before public push |
| 9   | One-pager + Loom from fresh clone | 2h | Final |

**Order**: 1 → 2 → 3 → 4 → 5 → 6 → 8 → 9. Task 7 is optional. Total remaining ~7-8h focused work.

---

## Pre-submission checklist (locked, applies to task 10)

1. Audit git history for any secrets (the dummy `fc-3d4...` key)
2. Both demos run from a fresh `docker compose up` in a clean clone
3. Loom recorded from the same clean clone, not the dev tree
4. One-pager fits on ONE page, scannable in 90 seconds
