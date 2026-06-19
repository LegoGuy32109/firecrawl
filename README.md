# Firecrawl Product Engineer (Interact) Take Home

**Josh Hale. 72 hour vertical slice.**

A prototype that turns Firecrawl's most expensive class of support tickets, "what just failed and where?", into an answer the customer can find on their own, and gives the Interact team a place to defend it.

---

## What I picked, and why

The customer feedback fell into roughly three buckets.

| Bucket | Tickets in `data/tickets.csv` | Items |
|---|---|---|
| **Debug the failure** (what failed, where, why) | `error confusion / debugging help` 214 plus `scrape failures on protected sites` 96 = **310 of 535 (58%)** | #2, #7, #8, #11 |
| Search and ranking | `search relevance / result count` 38 | #1, #4, #5 |
| Bigger product bets | (rest) | #3, #6, #9, #10 |

Item **#7** (workflow automation startup, 14 step action sequence, comes back as one `SCRAPE_FAILED`) is the canonical version of the largest ticket category. It's also the Interact specific shape of the same bug that #2, #8, and #11 are reporting: **the customer hits a failure inside a multistep browser run and the API gives them no way to localize it.** Fix that, and roughly 58% of the support load gets cheaper for everyone, not just the customer who wrote in.

That's the bet I defended.

## What I built

Four layers, each useful on its own, all aimed at the same problem.

### 1. A typed error and warning catalog (the response contract)

`apps/api/src/lib/error-codes.ts`, `error-catalog.ts`, `error-details.ts`, and `error-serde.ts`. Every error code is an enum value (`ScrapeError.ACTION`, `BrowserError.EXECUTION_FAILED`, ...) with a catalog entry that pins down `httpStatus`, `explanation`, and `fix`, plus a typed `details` shape for each code. For example, `ScrapeError.ACTION` carries `{ actionIndex, selector, pageUrl, screenshot, actionType, actionStatuses[] }`, and `BrowserError.EXECUTION_FAILED` carries `{ replayFailedAt: { actionIndex, actionType }, stderrSnippet, exitCode, ... }`. Generic `SCRAPE_FAILED` is gone.

The codepaths that used to throw it now have to pick a code, because the v2 responder takes a code plus the matching typed details and writes them through a privacy aware projection. There is no longer an escape hatch for opaque error strings: the responder's `fail(code, error, opts)` signature won't accept one, and the typed `details` shape forces the engine code to record actionIndex, selector, page URL, and screenshot at the moment the failure happens. The type system makes it impossible to ship a failure that has nowhere to record what failed, which is what customers in #2, #7, #8, and #11 were each running into in different shapes.

### 2. A single response envelope (the plumbing)

`controllers/v2/response-enveloper.ts` exposes `makeResponder(req, res)`, and every v2 route now resolves through it. The responder owns `diagnostics`, applies the request's privacy mode (ZDR strips raw text but keeps structure), and emits step level traces with `responder.step({ name, status, code, durationMs, details })`. This is how a 14 step action run produces 14 diagnostic entries instead of one boolean.

### 3. A local `playwright;cdp` engine (the lab)

The contracts in (1) only matter if I could exercise them on a tight loop. The existing local `playwright` engine in the registry doesn't support actions, screenshots, mobile emulation, or geolocation, which is most of what the failure path in #7 needs. Cloud fire engine does, but iterating against it would burn credits, add round trip latency, and put me in a shared sandbox with everyone else on the team.

I added a second engine, `playwright;cdp`, that connects to a local Playwright service over the Chrome DevTools Protocol and exposes the full feature surface (actions, screenshots at any size, mobile emulation, geolocation). The old `playwright` engine stays in place untouched, both for parity and as a fallback for callers that don't need any of the new features. The engine picker still prefers the higher quality engine when its features match the request, so there is no regression for callers who do not opt in.

The payoff is that I could trigger `SCRAPE_ACTION_ERROR` on a 14 step replay, watch the diagnostics waterfall populate, fix the projection, and rerun, all on my laptop, without spending production credits and without leaving the local Docker compose.

### 4. An admin Playground (the surface)

`apps/api/src/admin/playground/`. A Preact bundle mounted under the admin route alongside the other admin tools. It's the place I'd defend this prototype to the team.

- **Request builder** for `scrape` and `interact` (the latter exercises the replay path that #7 hits).
- **DiagnosticsWaterfall** that renders the per step diagnostics as a timeline. Each action gets a row with status, duration, code, and on failure the selector and screenshot.
- **Failure frame** in `ErrorView.tsx`. When the response is `SCRAPE_ACTION_ERROR` or `BROWSER_EXECUTION_FAILED`, the screen leads with "Action 3 failed: `#nav-login`" or "Replay reconstruction failed at action 11 (click)", the screenshot from the moment of failure, and the catalog `explanation` and `fix`. No more rerunning the chain with screenshots sprinkled in.

E2E coverage in `apps/api/src/__tests__/snips/v2/scrape-playwright-cdp.test.ts` asserts the contract: `actionIndex`, `selector`, `pageUrl`, and `code` are all populated on the failure path. Tests are gated with `TEST_SUITE_SELF_HOSTED` and `OPENAI_API_KEY` per `CLAUDE.md` so they run on the right matrix in CI.

## What I deliberately didn't build, and why

- **#1, #5. Search relevance and intent reranking.** Real product bets, multiweek, and Firecrawl already has `/search` ranking knobs and the deprecated deep research path. This needs a product conversation, not a prototype.
- **#3. Markdown dedupe.** Customer already wrote their own postprocessor. Low leverage.
- **#4. Fast 3 result snippets search mode.** A real ask, but a parameter change, not a vertical slice.
- **#6. Fortune 500 "just understand any website".** That's the **Agent** product. It already exists. The brief explicitly warns against rebuilding things.
- **#9. Self maintaining extractors.** This is the **Agent** and managed collector roadmap. Same reason as #6.
- **#10. LinkedIn at scale.** Bot mitigation and compliance, not a prototype.
- **#11. Session persistence and credential vaulting.** Adjacent to what I built (and the diagnostics here would help debug it), but security sensitive and a much bigger build.
- **#8. Slow tail latency.** Needs ops and SLO work, not API surface.
- **#2. Bring your own residential proxy.** Defensible, but the customer themselves said "we assumed making it go away wasn't on the table". The underlying ask is reliability on flagged domains, which is its own infra project.

The bet: one real problem, solved end to end, beats nine half features.

## How this lands if I'm hired Monday

This is what I'd do in week one. The interview notes from June 10 framed the team as **"build a prototype, defend it in an engineering meeting, get Mogary and 2 to 3 engineers if it earns the resources."** This repo is the prototype. The 45 minute demo is the defense. If it earns interest, the obvious next slices are:

1. **Push the same diagnostics shape down into Interact session chaining and persistent profiles**, so multicall replays inherit the step traces.
2. **Ship the error catalog out to the SDKs**, so customers writing `try` and `except` branches get autocomplete instead of regex on error strings. The TypeScript shapes are the source of truth, so the Python and Node SDKs can codegen from them.
3. **Wire the diagnostics into the accessibility tree optimization I floated on the call.** `BrowserAgent -C` strips noninteractable nodes from the LLM input. The same step trace tells us which nodes the LLM actually touched, so we can train the prune on real customer traffic.

Three to four weeks of focused work, fully owned, with the same shape Rafa described.

## One thing the AI got wrong, and how I caught it

I had Claude write the llm-proxy backend that spawns the local `claude` CLI to generate the summary and highlights blocks the playground renders on a successful response. It generated `"--prompt"` as the CLI flag to pass the prompt body, and an `isAuthError` matcher that included `output.includes("authentication")` and `output.includes("ENOENT")`. Type check and the unit tests both passed.

Two problems. `--prompt` is not a flag on the `claude` CLI (it's `-p`), so every call to the backend died at the subprocess boundary with a usage error. And the auth matcher would flag any error containing the substring "authentication" as an auth failure, which would mean the playground would tell the user to reauthenticate when the real failure was something else entirely. ENOENT was the same shape of bug, since it fires whenever a binary can't be located, not just on auth issues.

I caught the flag bug by running the actual summary path against the live backend and reading stderr from the failed subprocess. I caught the matcher bug while fixing the first one, because once one assumption in a chunk of AI generated code is wrong, the rest deserve a second read. The fix was `-p` as the flag, an auth matcher pinned to the exact strings the `claude` CLI actually emits ("401 Unauthorized", "Missing bearer or basic authentication"), and an integration test that exercises the backend instead of mocking it.

The lesson I keep relearning with AI tooling: **green CI is necessary but never sufficient.** For anything that exits the process or shells out to another binary, the loop is "build it, run it, read stderr." Same instinct I use on Open Dwarf's Playwright pipeline: render the thing and look at it.

---

**Repo layout for the reviewer.**

- Error system: [`error-codes.ts`](apps/api/src/lib/error-codes.ts), [`error-catalog.ts`](apps/api/src/lib/error-catalog.ts), [`error-details.ts`](apps/api/src/lib/error-details.ts), [`error-serde.ts`](apps/api/src/lib/error-serde.ts)
- Response envelope: [`response-enveloper.ts`](apps/api/src/controllers/v2/response-enveloper.ts)
- Local engine: [`engines/playwright/cdp.ts`](apps/api/src/scraper/scrapeURL/engines/playwright/cdp.ts), registered alongside `playwright` in [`engines/index.ts`](apps/api/src/scraper/scrapeURL/engines/index.ts)
- Playground entrypoint: [`admin/playground/`](apps/api/src/admin/playground)
- Playground UI: [`ErrorView.tsx`](apps/api/src/admin/playground/client/components/ErrorView.tsx), [`DiagnosticsWaterfall.tsx`](apps/api/src/admin/playground/client/components/DiagnosticsWaterfall.tsx)
- E2E: [`scrape-playwright-cdp.test.ts`](apps/api/src/__tests__/snips/v2/scrape-playwright-cdp.test.ts)

Run with `pnpm dev:local` (see `apps/api/scripts/`). The admin playground is mounted at the admin route.
