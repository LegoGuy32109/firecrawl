# 0002 — The commit is the prototype Rafa described, executing on Josh's own June 10 feedback

**Status:** accepted
**Date:** 2026-06-20
**Supersedes context for:** 0001 (extends, does not replace)

## Context

`./learning/reference/` contained three docs predating this teaching session:

1. `Interview-for-Position.md` — Josh's notes from a June 10 introductory call with Rafael Miller (Firecrawl).
2. `Product-Engineer-Interact-Role-Description.md` — the actual job posting Josh is interviewing for.
3. `Firecrawl-Role-Strategy-Career-Positioning.md` — strategic positioning analysis of how Josh should present himself relative to Firecrawl's public stance.

Reading them after writing lesson 0001 surfaces a meta-narrative the assignment-only framing missed.

## Insight

**Three facts tighten the loop dramatically:**

1. **On June 10, Josh told Rafa that Interact's biggest problem is poor error messages** ("generic 409s that lack actionable context for API users") and proposed making them more explicit, "specifying the exact point of failure in a replay." The commit *is that proposal, built.* This is not a take-home where Josh picked a problem at random — it's a prototype executing on feedback *he himself* gave Rafa nine days before submission.

2. **Rafa described Firecrawl's internal process as "build a prototype, defend it in an engineering meeting, then earn the resources."** Josh quoted this phrase verbatim in his one-pager. The 45-minute call is not a generic interview — it's Firecrawl's own *defend-your-prototype* ritual, applied to the candidate. The format is the test.

3. **Interact is publicly under-resourced** (Rafa's words: "no dedicated full-time engineer"). The role posting calls Interact "Firecrawl's #1 product hire". The commit isn't being judged on whether it's a good demo — it's being judged on whether Josh is the person who can ship Interact end-to-end starting Monday.

## Why it matters for the mission

This expands the win conditions from "defend the commit" to "demonstrate you are the Interact product engineer they need to hire." Every lesson should now subtly support both. Specifically:

- **Lesson 0001 stands** — the bucket/math/wedge argument is still the right opener for "why this customer". But the underlying answer to "why this problem" is *also* "because I already told Rafa this was the problem on June 10, and I built the answer."
- **Future lessons need a positioning thread.** When discussing the error catalog (layer 1), I should note that error-message quality is one of the five themes the role posting emphasizes ("response formats, latency, error handling, and the full feel of the developer-facing surface"). When discussing the Playground (layer 4), I should note that internal dogfooding tools are part of Firecrawl's stated culture.
- **The cuts list needs a sharper edge.** Cutting #6 (Fortune 500) and #9 (self-maintaining extractors) is also a *prioritization signal* — the role posting explicitly says "made prioritization calls, talked to customers, killed features that weren't working." Josh's cuts demonstrate this in writing.
- **Self-presentation matters.** The career-positioning doc warns against leading with "game developer" framing. In the call, Josh should describe himself as a "developer-platform engineer" who's been doing a smaller version of the Interact role. The commit is evidence; the framing carries it.
- **There's a quiet risk to manage.** Rafa already knows Josh proposed this in June. If Josh oversells the originality of the idea ("I picked the biggest bucket"), it can read as forgetting the prior conversation. Better framing: "I picked the bucket I'd already flagged to you in June, then built the answer."

## Open questions

- Who else from Firecrawl will be on the call? Rafa for sure. Knowing if Caleb (the listed manager) or other engineers are joining changes the depth of technical probe to prepare for.
- Has Josh shared the repo URL with the team yet? The brief says public repo at submission; if they've read it, "they've read the one-pager" is a higher bar than "they will have skimmed it."
