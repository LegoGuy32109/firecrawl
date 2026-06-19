# Product Engineer (Interact) Technical Assignment

A prototype that turns Firecrawl's most expensive class of support tickets, "what just failed and where?", into answers they resolve themselves.

---

## What I picked, and why

The customer feedback fell into roughly three buckets.

| Bucket | Tickets in `data/tickets.csv` | Items |
|---|---|---|
| **Debug the failure** (what failed, where, why) | `error confusion / debugging help` 214 plus `scrape failures on protected sites` 96 = **310 of 535 (58%)** | #2, #7, #8, #11 |
| Search and ranking | `search relevance / result count` 38 of 535 | #1, #4, #5 |
| Bigger product bets | (rest) | #3, #6, #9, #10 |

Item **#7** (workflow automation startup, 14 step action sequence, comes back as one `SCRAPE_FAILED`) is the canonical version of the largest ticket category. It's also the Interact specific shape of the same bug that #2, #8, and #11 are reporting: **the customer hits a failure inside a multistep browser run and the API gives them no way to localize it.** Fix that, and roughly 58% of the support load gets easier for everyone, not just the customer who wrote in.

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
<img width="auto" height="500" alt="image" src="https://github.com/user-attachments/assets/a5084771-973e-4a52-a19c-6c759438a06d" />

- **Failure frame** in `ErrorView.tsx`. When the response is `SCRAPE_ACTION_ERROR` or `BROWSER_EXECUTION_FAILED`, the screen leads with "Action 3 failed: `#nav-login`" or "Replay reconstruction failed at action 11 (click)", the screenshot from the moment of failure, and the catalog `explanation` and `fix`. No more rerunning the chain with screenshots sprinkled in.
<img width="auto" height="500" alt="image" src="https://github.com/user-attachments/assets/44e1fedb-bc28-4443-832e-a3a21bb19dcc" />

- **DiagnosticsWaterfall** that renders the per step diagnostics as a timeline. Each action gets a row with status, duration, code, and on failure the selector and screenshot.

E2E coverage in `apps/api/src/__tests__/snips/v2/scrape-playwright-cdp.test.ts` asserts the contract: `actionIndex`, `selector`, `pageUrl`, and `code` are all populated on the failure path. Tests are gated with `TEST_SUITE_SELF_HOSTED` and `OPENAI_API_KEY` per `CLAUDE.md` so they run on the right matrix in CI.

## What I deliberately didn't build, and why

- **#1, #5. Search relevance and intent reranking.** Firecrawl already has `/search` ranking knobs and the deprecated deep research path. This needs a product conversation, not a prototype.
- **#3. Markdown dedupe.** Customer already wrote their own postprocessor. Low leverage.
- **#4. Fast 3 result snippets search mode.** A real ask, but a parameter change, not worth a prototype.
- **#6. Fortune 500 "just understand any website".** That's overlapping the **Agent** product. It already exists. The brief explicitly warns against rebuilding things.
- **#9. Self maintaining extractors.** This is the **Agent** and managed collector roadmap. Same reason as #6.
- **#10. LinkedIn at scale.** Bot mitigation and compliance, not a prototype.
- **#11. Session persistence and credential vaulting.** Adjacent to what I built (and the diagnostics here would help debug it), but security sensitive and a much bigger build.
- **#8. Slow tail latency.** Needs internal operations knowledge, not as visible as an API surface.
- **#2. Bring your own residential proxy.** Defensible, but the customer themselves said "we assumed making it go away wasn't on the table". The underlying ask is reliability on flagged domains, which is its own infrastructure project.

I focused on the problem giving devs the most grief, solved end to end, beating nine half features.

## Next Steps

This is what I'd do week one at firecrawl. My interview with Rafa told me the team **"builds a prototype, defends it in an engineering meeting, then earns the resources."** This repo is the prototype. Showing how I solved customer problems is the defense. If it earns interest, the obvious next steps are:

1. **Ship the error catalog out to the SDKs**, so customers writing `try` and `except` branches get autocomplete instead of regexing error strings. The TypeScript shapes are the source of truth, so the SDKs could codegen from them.
2. **Expand Firecrawl Playground with more APIs**, focusing on scrape and interact accomplished my vertical slice, but doesn't showcase the power of the error catelog working with the response envelope.
3. **Add a llm-proxy for local development**, firecrawl's best features work with natural language processing. Developing this tool I envisoned a system to funnel llm calls to codex or claude to save on costs, but I cut it from the final product.

## What AI got wrong, and how I caught it

My agents would often confuse dead code in the firecrawl repo as valid and modify it to no behavioral change. I was able to resolve this by adding a 'noUnusedLocals' flag in tsconfig to easily identify unused logic and clean it to keep context relevant.

After working on a UI update for playground or trying to run unit tests on response shapes, the agent would spin it's wheels trying to get the docker stack running. It could take a half hour before it understood what it needed to do. I had to modify `pnpm dev:local` to handle all the edge cases so new agents without context could run the stack in one line instead of multiple docker cli schenanigans.

The lesson I keep relearning with AI tooling: **green CI is necessary but never sufficient.** For anything that exits the process or shells out to another binary, the loop is "build it, run it, read stderr." 

---

**Repo layout for the reviewer.**

- Error system: [`error-codes.ts`](apps/api/src/lib/error-codes.ts), [`error-catalog.ts`](apps/api/src/lib/error-catalog.ts), [`error-details.ts`](apps/api/src/lib/error-details.ts), [`error-serde.ts`](apps/api/src/lib/error-serde.ts)
- Response envelope: [`response-enveloper.ts`](apps/api/src/controllers/v2/response-enveloper.ts)
- Local engine: [`engines/playwright/cdp.ts`](apps/api/src/scraper/scrapeURL/engines/playwright/cdp.ts), registered alongside `playwright` in [`engines/index.ts`](apps/api/src/scraper/scrapeURL/engines/index.ts)
- Playground entrypoint: [`admin/playground/`](apps/api/src/admin/playground)
- Playground UI: [`ErrorView.tsx`](apps/api/src/admin/playground/client/components/ErrorView.tsx), [`DiagnosticsWaterfall.tsx`](apps/api/src/admin/playground/client/components/DiagnosticsWaterfall.tsx)
- E2E: [`scrape-playwright-cdp.test.ts`](apps/api/src/__tests__/snips/v2/scrape-playwright-cdp.test.ts)

Run with `pnpm dev:local` (see `apps/api/scripts/`). The admin playground is mounted at the admin route.
