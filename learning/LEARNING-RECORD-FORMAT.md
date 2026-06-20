# LEARNING-RECORD-FORMAT

A learning record captures a non-obvious lesson learned in this workspace — something a future agent (or future you) would need to reconstruct to teach this topic well, and that isn't already visible in the code or the lessons themselves.

Filename: `NNNN-dash-case-title.md`, e.g. `0001-starting-state.md`. Number increments monotonically.

Body sections:

1. **Status** — `accepted` / `superseded by NNNN` / `rejected`.
2. **Date** — absolute date the record was written. Convert any relative dates ("today", "this week") to absolute.
3. **Context** — what was happening when this was learned.
4. **Insight** — the lesson itself. Lead with the punchline.
5. **Why it matters for the mission** — how this changes future lessons or framing.
6. **Open questions** — what is still unknown, if anything.

Learning records are loosely equivalent to architectural decision records. They are append-only in spirit: when a record turns out to be wrong, write a new one that supersedes it rather than editing the old one.
