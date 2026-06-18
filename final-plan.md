The headline shift: start by understanding interact end-to-end, because that's the room you need to own on the call. The envelope/UI work follows that.

┌─────┬───────────────────────────────────────────────────────────────────────────────────────────────────┬────────┬───────────────────────────────────────────────────────┐
│  #  │                                               Task                                                │ Effort │                    Why this order                     │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│     │ Read scrapeInteractController + browser-service-client + browser-agent end-to-end. Map the exact  │        │ You said you want to feel comfortable with interact.  │
│ 1   │ failure paths (where errors bubble, what shape they have today, where you'd inject the envelope)  │ 45m    │ Do this first — it'll inform every code decision      │
│     │                                                                                                   │        │ after.                                                │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│ 2   │ Write the shared diagnostic envelope as a TS type. Decide: top-level diagnostics: { steps,        │ 30m    │ One short design spike. Cheap to throw away if wrong. │
│     │ lastUrl, lastScreenshot, failedStep } or per-code via details                                     │        │                                                       │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│ 3   │ Wire the envelope into scrapeInteractController failure paths (BROWSER_EXECUTION_FAILED +         │ 1.5-2h │ The demonstrable core. Reviewers will read this diff  │
│     │ replay-failure paths)                                                                             │        │ first.                                                │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│ 4   │ Wire the envelope into the scrape-side SCRAPE_ACTION path                                         │ 1-1.5h │ Second proof point. Mostly populating fields you      │
│     │                                                                                                   │        │ already have access to.                               │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│ 5   │ ErrorView: SCRAPE_ACTION renderer + BROWSER_EXECUTION_FAILED renderer + inline <img> for          │ 1.5h   │ Pure UI on top of the envelope.                       │
│     │ screenshot + waterfall failed-row highlight                                                       │        │                                                       │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│ 6   │ Cuts (FeatureNav, header pill, RecorderPanel)                                                     │ 30m    │ Quick win, do whenever                                │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│ 7   │ Compose profiles + git history squash                                                             │ 1h     │ Blocks public push                                    │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│ 8   │ UI seam: "Open in Interact" button + jobId input                                                  │ 45m    │ Demo polish                                           │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│ 9   │ End-to-end verification of both demos                                                             │ 1h     │                                                       │
├─────┼───────────────────────────────────────────────────────────────────────────────────────────────────┼────────┼───────────────────────────────────────────────────────┤
│ 10  │ One-pager + Loom from fresh clone                                                                 │ 2h     │ Last                                                  │
└─────┴───────────────────────────────────────────────────────────────────────────────────────────────────┴────────┴───────────────────────────────────────────────────────┘
