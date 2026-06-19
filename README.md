# Firecrawl — Product Engineer (Interact) take-home

**Josh Hale · 72-hour vertical slice**

A prototype that turns Firecrawl's most expensive class of support tickets — "what just failed and where?" — into a self-serve answer, and gives the Interact team a place to defend it.

---

## What I picked, and why

The customer feedback fell into roughly three buckets:

| Bucket | Tickets in `data/tickets.csv` | Items |
|---|---|---|
| **Debug-the-failure** (what failed, where, why) | `error confusion / debugging help` 214 + `scrape failures on protected sites` 96 = **310 / 535 (58%)** | #2, #7, #8, #11 |
| Search / ranking | `search relevance / result count` 38 | #1, #4, #5 |
| Bigger product bets | (rest) | #3, #6, #9, #10 |

Item **#7** (workflow automation startup, 14-step action sequence, comes back as one `SCRAPE_FAILED`) is the canonical version of the largest ticket category. It's also the Interact-specific shape of the same bug that #2, #8, and #11 are reporting: **the customer hits a failure inside a multi-step browser run and the API gives them no way to localize it.** Fix that, and ~58% of the support load gets cheaper for everyone — not just the customer who wrote in.

That's the bet I defended.

## What I built

Three layers, each useful on its own, all aimed at the same problem:

### 1. A typed error/warning catalog (the response contract)

`apps/api/src/lib/error-codes.ts` + `error-catalog.ts` + `error-details.ts` + `error-serde.ts`. Every error code is an enum value (`ScrapeError.ACTION`, `BrowserError.EXECUTION_FAILED`, …) with a catalog entry that pins down `httpStatus`, `explanation`, and `fix`, plus a per-code `details` shape — e.g. `ScrapeError.ACTION` carries `{ actionIndex, selector, pageUrl, screenshot, actionType, actionStatuses[] }`, and `BrowserError.EXECUTION_FAILED` carries `{ replayFailedAt: { actionIndex, actionType }, stderrSnippet, exitCode, … }`. Generic `SCRAPE_FAILED` is gone; the codepaths that used to throw it now have to pick a code that has somewhere to put the diagnostic info.

### 2. A single response envelope (the plumbing)

`controllers/v2/response-enveloper.ts` exposes `makeResponder(req, res)` — every v2 route now resolves through it. The responder owns `diagnostics`, applies the request's privacy mode (ZDR strips raw text but keeps structure), and emits step-level traces with `responder.step({ name, status, code, durationMs, details })`. This is how a 14-step action run produces 14 diagnostic entries instead of one boolean.

### 3. An admin Playground (the surface)

`apps/api/src/admin/playground/` — Preact bundle mounted under the admin route alongside the other admin tools. It's the place I'd defend this prototype to the team:
- **Request builder** for `scrape` and `interact` (the latter exercises the replay path that #7 hits).
- **DiagnosticsWaterfall** that renders the per-step diagnostics as a timeline — each action gets a row with status, duration, code, and (on failure) selector and screenshot.
- **Failure frame** in `ErrorView.tsx` — when the response is `SCRAPE_ACTION_ERROR` or `BROWSER_EXECUTION_FAILED`, the screen leads with "Action 3 failed: `#nav-login`" or "Replay reconstruction failed at action 11 (click)", the screenshot from the moment of failure, and the catalog `explanation` + `fix`. No more re-running the chain with screenshots sprinkled in.
- **Live view** for in-flight sessions — the recorder/livecast WS so the engineer can watch the next replay land.

E2E coverage in `apps/api/src/__tests__/snips/v2/scrape-playwright-cdp.test.ts` asserts the contract: `actionIndex`, `selector`, `pageUrl`, `code` are all populated on the failure path. Tests are gated with `TEST_SUITE_SELF_HOSTED` / `OPENAI_API_KEY` per `CLAUDE.md` so they run on the right matrix in CI.

A local CDP Playwright engine (`scrapeURL/engines/playwright/cdp.ts`) was added so the whole loop runs without fire-engine — which is what made it possible to actually iterate on the failure path in 72 hours.

## What I deliberately didn't build, and why

- **#1, #5 — search relevance / intent reranking.** Real product bets, multi-week, and Firecrawl already has `/search` ranking knobs and the deprecated deep-research path; this needs a product conversation, not a prototype.
- **#3 — markdown dedupe.** Customer has a working post-processor. Low leverage.
- **#4 — "fast 3-result snippets" search mode.** A real ask, but a parameter change, not a vertical slice.
- **#6 — Fortune 500 "just understand any website".** That's the **Agent** product; it already exists. The brief explicitly warns against rebuilding things.
- **#9 — self-maintaining extractors.** This is the **Agent**/managed-collector roadmap. Same reason as #6.
- **#10 — LinkedIn at scale.** Anti-bot/compliance, not a prototype.
- **#11 — session persistence + credential vaulting.** Adjacent to what I built (and the diagnostics here would help debug it), but security-sensitive and a much bigger build.
- **#8 — slow-tail latency.** Needs ops/SLO work, not API surface.
- **#2 — bring-your-own residential proxy.** Defensible, but the customer themselves said "we assumed making it go away wasn't on the table" — the underlying ask is reliability on flagged domains, which is its own infra project.

The bet: one real problem, solved end-to-end, beats nine half-features.

## How this lands if I'm hired Monday

This is what I'd do in week one. The interview notes from June 10 framed the team as **"build a prototype, defend it in an engineering meeting, get Mogary and 2–3 engineers if it earns the resources."** This repo is the prototype. The 45-minute demo is the defense. If it earns interest, the obvious next slices are:

1. **Push the same diagnostics shape down into Interact session chaining and persistent profiles** so multi-call replays inherit the step traces.
2. **Ship the error catalog to the SDKs** (the TS shapes are already source-of-truth — the Python/Node SDKs can codegen from them) so customers writing `try/except` branches get autocomplete, not regex on error strings.
3. **Wire the diagnostics into the **accessibility-tree** optimization I floated on the call** — `BrowserAgent -C` strips non-interactable nodes from the LLM input; the same step trace tells us which nodes the LLM actually touched, so we can train the prune.

Three to four weeks of focused work, fully owned, with the same shape Rafa described.

## One thing the AI got wrong, and how I caught it

I had Claude wire up the admin LiveView WebSocket. It returned code that opened the WS at `/view`, copy-pasted a `BULL_AUTH_KEY` global header from another part of the codebase, and forgot to mount the `LiveView` and `RecorderPanel` components in `App.tsx` — so when I loaded the playground in the browser, the live tab just sat blank. Type-check and unit tests both passed.

I caught it by running the actual app (per `CLAUDE.md`: type checking and tests verify code correctness, not feature correctness) and watching the Network tab — the WS upgrade was 404'ing on `/view`, not `/view/ws`, and `BULL_AUTH_KEY` was leaking into the client bundle as `undefined`. Commit `381210c8` ("course corrections — WS path, auth, live view wiring, CDP URL") is the fix: correct upstream path, kill the global, mount the components, and add a `TODO` for the upstream auth header passthrough so the next person knows it's still open.

The lesson I keep relearning with AI tooling: **green CI is necessary but never sufficient.** For anything user-facing the loop is "build it, open it, click it." Same instinct I use on Open Dwarf's Playwright pipeline — render the thing and look at it.

---

**Repo layout for the reviewer.** Error system: `apps/api/src/lib/error-*.ts`. Response envelope: `apps/api/src/controllers/v2/response-enveloper.ts`. Playground: `apps/api/src/admin/playground/`. E2E: `apps/api/src/__tests__/snips/v2/scrape-playwright-cdp.test.ts`. Local engine: `apps/api/src/scraper/scrapeURL/engines/playwright/cdp.ts`. Run with `pnpm dev:local` (see `apps/api/scripts/`); the admin playground is mounted at the admin route.
