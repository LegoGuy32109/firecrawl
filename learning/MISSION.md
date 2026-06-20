# Mission

**Defend commit `12132753b0aa` to the Firecrawl product engineering team in a 45-minute call on Monday 2026-06-22 at 18:00 (~3 days from now) — and in doing so, demonstrate I am the Interact product engineer they need to hire.**

## The shape of the call

Per the brief (`~/Projects/velvet-comet/README.md`):

> Then we do a 45-min call: you demo it live and we dig into the implementation. What you built, how it works, why you made each call. If it can't be explained and demoed in that call, it's too big.

> We care about what you chose and why. Narrow and deep beats wide and shallow.

The team will have already read the one-pager (commit's `README.md`). They will dig at the seams: why this customer, why this shape of fix, why these four layers, why these tools. They are senior engineers who built the product I just modified — assume they know more about every file than I do, and prepare to defend choices, not explain syntax.

**Meta-narrative I should not forget** (per learning record 0002):

- On 2026-06-10, in an intro call with Rafa, *I* told him Interact's biggest problem was poor error messages and proposed pinpointing the failing replay step. The commit *is* that proposal built. The framing is "I picked the bucket I'd already flagged to you, then built the answer" — not "I picked the largest bucket at random."
- Firecrawl's internal process *is* "build a prototype, defend it in an engineering meeting, then earn the resources." Rafa used this phrase in the June 10 call; I quoted it in the one-pager. The 45-minute call is Firecrawl's own ritual applied to me. **The format is the test.**
- The Interact role is publicly framed as the company's #1 product hire; the product is publicly under-resourced. This call decides whether I ship Interact starting Monday.

## Why this is the mission and not "learn Firecrawl"

I already built this. The risk is not that I don't know the code — it's that I can't articulate *why* I made each call when an experienced engineer pushes back in real time. Fluent retrieval of my own rationale, under interview pressure, with a working demo in the background, is the skill.

## Win conditions

- I can walk the demo cleanly from cold start in under 10 minutes, including one deliberate failure recovery (token reuse, container restart, or DB re-seed).
- For each of the four layers in my one-pager (error catalog, response envelope, CDP engine, Playground), I can state in one sentence: *the problem it solves*, *the alternative I rejected*, and *what I'd do next.*
- I can name and defend at least three non-obvious design choices the team is likely to probe (e.g. sentinel-in-stderr for crossing the Playwright subprocess boundary, ZDR-aware screenshot capture, the `force-replay` session mode, choosing a synthetic `replay-fault` site over real flaky targets).
- I can answer "what did you almost build and cut?" without scrambling. The one-pager already lists eight cuts — I should be able to elaborate on any of them.
- I can answer "what did your AI tools get wrong?" with at least two concrete examples beyond the two in the one-pager.
- **I land the meta-narrative without saying it out loud.** The team should leave thinking "Josh has already been doing a smaller version of the Interact role" — not "Josh did a great take-home."
- **I describe myself as a developer-platform engineer**, not a game-dev or a Playwright user. Per the career-positioning doc, this is the highest-leverage framing shift.

## Out of scope

- Learning how Firecrawl works in general (the team built it).
- Re-architecting anything. The call is in three days; if a flaw surfaces, I name it and propose a fix — I do not silently rewrite code.
- Line-by-line code walkthroughs. The team did not ask for that, and "if it can't be explained in the call, it's too big" cuts in both directions.

## The three pillars for lessons

Per the scoping question on 2026-06-20:

1. **Design defenses** — why-this-not-that for each layer and each non-obvious choice.
2. **Demo choreography** — exact click/type sequence, what each step proves, recovery from a flaky run.
3. **Adjacent surfaces** — the parts of the 290-file diff that aren't the headline (admin route moves, docker-compose splits, DB seed, knip config, etc.) so I can defend the whole diff, not just the F7 feature.
