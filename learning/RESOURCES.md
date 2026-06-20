# Resources

High-quality, high-trust sources to ground knowledge in. Listed roughly in order of authority for *this specific mission*.

## Primary sources (you wrote or commissioned these)

- **The commit itself** — `git show 12132753b0aa` on this repo. The single most authoritative source for everything in this mission.
- **The one-pager** — top of `README.md` in commit 12132753 (also displayed when this repo is opened on GitHub). The team has read this. It is the contract for what you owe in the call.
- **The assignment brief** — `~/Projects/velvet-comet/README.md`. Has the 11 customer feedback items, the data/ folder reference, and the rules of the engagement.
- **`Interview-for-Position.md`** in `./learning/reference/` — your notes from the June 10 intro call with Rafa. **Critical.** Establishes that you proposed the failure-localization fix in that call; the commit executes on your own feedback.
- **`Product-Engineer-Interact-Role-Description.md`** in `./learning/reference/` — the role posting. Reference for what behaviors you should be visibly demonstrating in the call.
- **`Firecrawl-Role-Strategy-Career-Positioning.md`** in `./learning/reference/` — the strategic framing analysis. Reference for self-presentation language.

## Secondary sources (Firecrawl as it shipped)

- **The pre-commit state** — `git show 12132753b0aa~1` for the file before your changes. Use to make "before / after" arguments crisp.
- **`CLAUDE.md` at the repo root** — the project's testing/dev rules. Used to defend the test gating choices (`TEST_SUITE_SELF_HOSTED`, `OPENAI_API_KEY`, e2e-over-unit preference).
- **`apps/api/.env.local` + `docker-compose.dev.yaml` + `docker-compose.playground.yaml`** — the stack you're demoing on. Read these enough to answer "why does the demo run on this not that."

## Tertiary sources (for context you may be asked about, not for primary defense)

- **Firecrawl public docs** at `https://docs.firecrawl.dev/` — what customers actually see for `/v2/scrape` and `/v2/interact`. Worth a 10-minute skim so you can locate yourself relative to the public surface.
- **Playwright docs** at `https://playwright.dev/docs/` — for any questions about the CDP engine and the subprocess boundary. Specifically: `BrowserContext.exposeBinding`, `page.evaluate`, and the connection-over-CDP pattern.
- **Chrome DevTools Protocol reference** at `https://chromedevtools.github.io/devtools-protocol/` — only if asked about specific CDP methods.

## Communities (for testing the skills in the wild, post-call)

- **Firecrawl Discord** at `https://discord.gg/firecrawl` — once you're on the team, this is where the customer feedback in your brief came from. Skim a few threads pre-call so you can speak about the channel from observation, not just from the brief excerpts.

---

Add resources here as they prove load-bearing in lessons. Each lesson should link a *primary source* (something I can read or re-read after the lesson) so knowledge is grounded.
