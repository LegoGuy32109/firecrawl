# 0001 — Starting state for the velvet-comet interview prep

**Status:** accepted
**Date:** 2026-06-20

## Context

Josh built the velvet-comet take-home assignment and committed it as `12132753b0aabb7b595095d5f20b770a423a7bfd` on 2026-06-19. The Firecrawl team has scheduled a 45-minute call for Monday 2026-06-22 at 18:00, during which Josh will demo the work and the team will dig into the implementation. Josh has ~3 days to prep.

When this workspace was opened, Josh's auto-memory had a stale, narrow view of the project (`project-velvet-comet.md` described only the F7 error-envelope work and called the branch `improve-admin-dashboard`). The actual one-pager in the commit's README frames the work as **four layers** (typed error catalog → response envelope → local CDP engine → admin Playground), and the current branch is `improve-firecrawl-errors`. Memory updated.

## Insight

**The thing Josh needs to defend is bigger than the F7 fix.** The team will read his one-pager before the call. The one-pager argues that he picked the 58%-of-tickets debugging bucket (#7 as the canonical case), and built a generalizable error contract + a local lab to iterate on it, not just a screenshot-on-failure feature for `/interact`. Lessons that frame the work as "structured errors for `/interact`" will undersell the build and leave him flat-footed when the team asks "why an entire catalog, why a CDP engine, why a Playground?"

The right framing for every lesson: **what problem does this layer solve that the other three layers don't, and what's the cheapest alternative I rejected?**

## Why it matters for the mission

- Lessons should be organized around the four layers + the supporting infrastructure (replay-fault site, e2e tests, docker-compose splits), not around individual files.
- The first lesson should establish the four-layer mental model so every subsequent lesson can refer back to it.
- Demo choreography lessons should walk all four layers in a single demo run, not just the F7 happy/sad paths in the existing `reference-demo-examples` memory.

## Open questions

- What is the demo environment Josh plans to use on Monday — the playground compose stack or `pnpm dev:local`? The dev-workflow memory warns these conflict on ports. Need to lock this in before writing the demo choreography lessons.
- How much of the *adjacent surfaces* coverage (e.g. admin route moves from `controllers/v0/` to `admin/`, knip config, monitoring/runner.ts removal) does Josh remember in detail, vs need lessons on?
