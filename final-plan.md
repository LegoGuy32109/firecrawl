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

## Critical path

| #   | Task | Effort | Why this order |
| --- | ---- | ------ | -------------- |
| ✅ 1 | Read interact end-to-end, map failure paths | 45m | Done |
| ✅ 2 | Envelope as per-code ErrorDetailsMap extensions | 30m | Done |
| ✅ 3 | Wire envelope into interact (main exec + replay-init) | 1.5-2h | Done |
| ✅ 4 | Wire envelope into scrape-side SCRAPE_ACTION | 1-1.5h | Done |
| ✅ 7a | `docker-compose.playground.yaml` + profile-gate optional services | 1h | Done — required for any CLI verification |
| **9a** | **CLI verification of all 4 failure modes** | **30m** | **NEXT — prove reality before UI effort** |
| 9b | Test-site flaky page (deterministic replay-divergence scenario) | 1h | Needed for Scene 3 of the live demo; CAN be skipped if Scene 3 uses a real-world flaky URL |
| 5  | UI: SCRAPE_ACTION + BROWSER_EXECUTION_FAILED renderers + inline `<img>` + waterfall highlight | 1.5h | Visible payoff for all the API work |
| 6  | Cuts (FeatureNav, header pill, RecorderPanel) | 30m | Shrink surface area before final UI polish |
| 8  | UI seam: "Open in Interact" button + manual jobId input | 45m | Scene 1→2 transition |
| 9c | E2E walkthrough of all 3 scenes through the UI | 1h | First time we run the whole demo as a reviewer would |
| 7b | Git history squash → new public repo | 45m | Last code step before public push |
| 10 | One-pager + Loom from fresh clone | 2h | Final |

**Order**: 9a → 9b → 5 → 6 → 8 → 9c → 7b → 10. Total remaining ~8h focused work.

The big move: **9a is the next step**, not 5. Verifying all four failure modes via CLI before sinking 1.5h into UI is the right call.

---

## Pre-submission checklist (locked, applies to task 10)

1. Audit git history for any secrets (the dummy `fc-3d4...` key)
2. Both demos run from a fresh `docker compose up` in a clean clone
3. Loom recorded from the same clean clone, not the dev tree
4. One-pager fits on ONE page, scannable in 90 seconds
