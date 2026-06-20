# Notes

Scratchpad for preferences and working notes the user has expressed.

## Preferences

- **Terse responses, no trailing summaries.** From memory `feedback-dev-workflow` and `user-josh`. Each lesson should be short — a single tangible win — not a wall of text.
- **Single-command workflows.** Don't ask the user to chain commands.
- **Dev workflow rules** are codified in memory `feedback-dev-workflow.md`. Re-read before writing demo-choreography lessons.

## Working notes

- Today is 2026-06-20 (Saturday). Call is Monday 2026-06-22 at 18:00 — about 3 days.
- The selected pillars for lessons are: **design defenses**, **demo choreography**, **adjacent surfaces**. No deep code walkthroughs — Josh wrote it, the team will probe choices not syntax.
- The one-pager (top of `README.md` in commit 12132753) frames the work as **four layers**: typed error catalog → response envelope → local CDP engine → admin Playground. Lessons should mirror that framing; the team has already read the one-pager and will probe along those lines.
- The memory file `project-velvet-comet.md` is *partially out of date* — it describes only the F7 error envelope and missed the wider 4-layer framing in the actual one-pager. Don't rely on it as a complete summary; read the commit's README directly. (Now updated.)
- Branch is `improve-firecrawl-errors`, not `improve-admin-dashboard` as memory says. Confirmed via `git status`.
- **Meta-narrative (learning record 0002):** Josh proposed the fix to Rafa on June 10 *before* getting the take-home. The commit IS that proposal. Lessons should subtly land "I already told you this was the problem; I built the answer" without saying it out loud.
- **Self-presentation rule (per the career-positioning doc):** lead with "developer-platform engineer / external API design / browser interaction as a developer product." De-emphasise game-dev framing. Playwright as a *reliability and observability layer*, not a testing library.
- **Lesson format (set 2026-06-20):** drill format, not article format. Probe → response → coaching note. Use the `.drill` CSS class in `assets/lesson.css`. Each lesson should have a small set of probes you can cover/uncover for self-quizzing. Coaching notes are short — what makes the response work, what trap to avoid. Add a speed-run section at the end for retrieval practice. Lessons are interview drills, not explainers.
- **Confirmed: Rafa solo, technical dig.** They've read the one-pager. So lessons should assume the one-pager's claims are already in the room — Rafa will probe *behind* the claims, not test whether you can recite them.
