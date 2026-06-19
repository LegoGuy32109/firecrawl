# Firecrawl Playground CLI Verification Tests

A self-contained test plan for verifying that the structured error envelope
(`pageUrl`, `screenshot`, `actionIndex`, `selector`, `replayFailedAt`,
`stderrSnippet`) is on the wire across all the failure modes feedback #7 asked
about, AND that the screenshot capture works end-to-end (so an empty
`screenshot` isn't being silently passed through from a broken engine).

**Read-only.** Do NOT modify code. If a test fails, capture the full response
and the most likely cause hypothesis. Do not debug or fix.

---

## Setup

1. `cd /home/josh/Projects/josh-firecrawl`

2. Wipe prior docker state (initdb scripts only run on a fresh volume):
   ```bash
   docker compose -f docker-compose.yaml -f docker-compose.playground.yaml down -v
   ```

3. Bring up the playground stack (rebuild to pick up source changes):
   ```bash
   docker compose -f docker-compose.yaml -f docker-compose.playground.yaml up -d --build
   ```
   First build: 5-15 min (Rust/Go API image + Playwright Chromium image).

4. Wait for liveness:
   ```bash
   until curl -fsS http://localhost:3002/v0/health/liveness >/dev/null 2>&1; do sleep 3; done
   echo "API up."
   ```
   If this loop runs > 5 min past build completion, dump and report:
   ```bash
   docker compose -f docker-compose.yaml -f docker-compose.playground.yaml ps
   docker compose -f docker-compose.yaml -f docker-compose.playground.yaml logs api --tail 80
   docker compose -f docker-compose.yaml -f docker-compose.playground.yaml logs nuq-postgres --tail 40
   ```

5. Auth header (any non-empty Bearer works; `local-db-setup.sql`'s mock auth function accepts any key):
   ```bash
   AUTH='Authorization: Bearer fc-3d478a296e59403e85c794aba81ffd2a'
   ```

6. Ensure `jq` is available (`apt-get install -y jq` if missing).

---

## Section A — Success tests (engine sanity)

These prove the playwright-service can actually capture screenshots and return
content. If these fail, the failure tests below would be testing against a
broken engine.

### Test S1 — Plain scrape success

```bash
curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"url": "https://example.com"}' > /tmp/S1.json

jq '{
  success, code,
  status,
  hasMarkdown: (.data.markdown // null | length // 0 | . > 0),
  markdownPrefix: (.data.markdown // "" | .[0:60]),
  hasMetadata: (.data.metadata != null)
}' /tmp/S1.json
```

PASS:
- `success: true`
- `code: null` (no error code on success)
- `status: "ok"` or `"warning"`
- `hasMarkdown: true`
- `markdownPrefix` contains some text from example.com (the doc title or first line)
- `hasMetadata: true`

### Test S2 — Scrape with screenshot format (engine screenshot capture)

```bash
curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{
    "url": "https://example.com",
    "formats": ["markdown", {"type": "screenshot"}]
  }' > /tmp/S2.json

jq '{
  success,
  screenshotLen: (.data.screenshot // "" | length),
  screenshotPrefix: (.data.screenshot // "" | .[0:10]),
  hasMarkdown: (.data.markdown // "" | length > 0)
}' /tmp/S2.json
```

PASS:
- `success: true`
- `screenshotLen > 1000` (real screenshot, not empty)
- `screenshotPrefix` is a base64 image header (e.g. `"/9j/4AAQSk"` for JPEG, or `"iVBORw0KGg"` for PNG)
- `hasMarkdown: true`

**This is the critical engine-health check.** If `screenshotLen` is 0 here, ALL
failure-test screenshots will also be empty — the issue is the engine, not our
diff.

### Test S3 — Scrape with action-level screenshot

```bash
curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{
    "url": "https://example.com",
    "actions": [
      {"type": "wait", "milliseconds": 300},
      {"type": "screenshot"}
    ]
  }' > /tmp/S3.json

jq '{
  success,
  topLevelScreenshot: (.data.screenshot // null),
  actionScreenshotCount: (.data.actions.screenshots // [] | length),
  firstActionScreenshotLen: (.data.actions.screenshots // [] | .[0] // "" | length),
  firstActionScreenshotPrefix: (.data.actions.screenshots // [] | .[0] // "" | .[0:10])
}' /tmp/S3.json
```

PASS:
- `success: true`
- `actionScreenshotCount: 1`
- `firstActionScreenshotLen > 1000`
- `firstActionScreenshotPrefix` is a base64 image header

### Test S4 — Interact success (replay-then-execute happy path)

Two-step. Scrape with `origin: "website"` so `scrape_id` is in the top-level response:

```bash
curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"url": "https://example.com", "origin": "website"}' > /tmp/S4-scrape.json

JOB_ID=$(jq -r '.scrape_id // .data.id // .id // empty' /tmp/S4-scrape.json)
echo "Job ID: $JOB_ID"
[ -z "$JOB_ID" ] && { echo "STOP: no jobId in scrape response"; jq . /tmp/S4-scrape.json | head -40; exit 1; }
```

Then interact with code that doesn't throw:
```bash
curl -sS -X POST "http://localhost:3002/v2/scrape/$JOB_ID/interact" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{
    "code": "const title = await page.title(); console.log(\"OK:\", title);",
    "language": "node",
    "timeout": 15
  }' > /tmp/S4.json

jq '{
  success, code,
  status,
  stdout: (.stdout // null),
  hasErrorCode: (.code != null)
}' /tmp/S4.json
```

PASS:
- `success: true`
- `code: null` (no error code)
- `hasErrorCode: false`
- `stdout` contains `"OK: Example Domain"` (or similar)

Cleanup this session before moving on:
```bash
curl -sS -X DELETE "http://localhost:3002/v2/scrape/$JOB_ID/interact" -H "$AUTH" > /dev/null
```

---

## Section B — Failure tests (envelope verification)

These verify the new envelope is populated for the four customer-visible
failure modes feedback #7 asked about.

### Test F1 — Selector miss in click action

```bash
curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{
    "url": "https://example.com",
    "actions": [
      {"type": "wait", "milliseconds": 200},
      {"type": "click", "selector": ".this-selector-does-not-exist-xyz"}
    ]
  }' > /tmp/F1.json

jq '{
  success, code,
  actionIndex: .details.actionIndex,
  selector: .details.selector,
  pageUrl: .details.pageUrl,
  screenshotLen: (.details.screenshot | length // 0),
  screenshotPrefix: (.details.screenshot[0:10] // null)
}' /tmp/F1.json
```

PASS:
- `success: false`
- `code: "SCRAPE_ACTION_ERROR"`
- `actionIndex: 1` (zero-indexed — wait is 0, click is 1)
- `selector: ".this-selector-does-not-exist-xyz"`
- `pageUrl` starts with `https://example.com`
- `screenshotLen > 1000`
- `screenshotPrefix` matches `/9j/...` or `iVBORw...`

### Test F2 — Wait-for-selector timeout

```bash
curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{
    "url": "https://example.com",
    "actions": [
      {"type": "wait", "selector": ".this-will-never-appear-zzz"}
    ]
  }' > /tmp/F2.json

jq '{
  success, code,
  actionIndex: .details.actionIndex,
  selector: .details.selector,
  pageUrl: .details.pageUrl,
  screenshotLen: (.details.screenshot | length // 0),
  screenshotPrefix: (.details.screenshot[0:10] // null),
  errorMessage: .error
}' /tmp/F2.json
```

This test takes ~15-30s to complete (it waits for the action timeout). The
recent buffer fix in `cdp.ts` ensures the action timeout fires BEFORE the
scrape's outer abort.

PASS:
- `success: false`
- `code: "SCRAPE_ACTION_ERROR"` (CRITICAL — earlier runs without the buffer fix returned `SCRAPE_TIMEOUT` here)
- `actionIndex: 0`
- `selector: ".this-will-never-appear-zzz"`
- `pageUrl` starts with `https://example.com`
- `screenshotLen > 1000`
- `errorMessage` mentions timeout/Timeout

If `code` is `SCRAPE_TIMEOUT` instead, the buffer fix isn't deployed — confirm the playwright-service was rebuilt (`docker compose ... up -d --build`).

### Test F3 — Interact JS exception, no replay pattern

```bash
curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"url": "https://example.com", "origin": "website"}' > /tmp/F3-scrape.json

JOB_ID=$(jq -r '.scrape_id // .data.id // .id // empty' /tmp/F3-scrape.json)
echo "Job ID: $JOB_ID"
[ -z "$JOB_ID" ] && { echo "STOP: no jobId"; exit 1; }

curl -sS -X POST "http://localhost:3002/v2/scrape/$JOB_ID/interact" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{
    "code": "throw new Error('\''intentional test failure'\'');",
    "language": "node",
    "timeout": 10
  }' > /tmp/F3.json

jq '{
  success, code,
  exitCode: .details.exitCode,
  pageUrl: .details.pageUrl,
  screenshotLen: (.details.screenshot | length // 0),
  screenshotPrefix: (.details.screenshot[0:10] // null),
  stderrSnippet: (.details.stderrSnippet[0:200] // null),
  replayFailedAt: .details.replayFailedAt
}' /tmp/F3.json
```

PASS:
- `success: false`
- `code: "BROWSER_EXECUTION_FAILED"`
- `exitCode: 1`
- `pageUrl` starts with `https://example.com`
- `screenshotLen > 1000`
- `stderrSnippet` contains `"intentional test failure"`
- `replayFailedAt: null` (CRITICAL — code failure, not replay failure)

### Test F4 — Interact JS exception WITH replay pattern (parser test)

Verifies the `parseReplayFailure` regex extracts and populates `replayFailedAt`
when stderr matches the replay-script format. Reuses Test F3's `JOB_ID`.

```bash
curl -sS -X POST "http://localhost:3002/v2/scrape/$JOB_ID/interact" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{
    "code": "throw new Error('\''Replay action #3 (click): synthetic test of replay parser'\'');",
    "language": "node",
    "timeout": 10
  }' > /tmp/F4.json

jq '{
  success, code,
  exitCode: .details.exitCode,
  pageUrl: .details.pageUrl,
  screenshotLen: (.details.screenshot | length // 0),
  stderrSnippet: (.details.stderrSnippet[0:200] // null),
  replayFailedAt: .details.replayFailedAt
}' /tmp/F4.json
```

PASS:
- `success: false`
- `code: "BROWSER_EXECUTION_FAILED"`
- `exitCode: 1`
- `pageUrl` starts with `https://example.com`
- `screenshotLen > 1000`
- `stderrSnippet` contains `"Replay action #3 (click)"`
- **`replayFailedAt: { "actionIndex": 3, "actionType": "click" }`** ← the discriminator this test exists to verify

Cleanup:
```bash
curl -sS -X DELETE "http://localhost:3002/v2/scrape/$JOB_ID/interact" -H "$AUTH" > /dev/null
```

---

### Test F5a — Replay fault: scrape action element disappears before interact

Verifies the customer issue #7 path: a scrape action succeeds on the original
scrape, but the interact session later fails while replaying that saved action
to reconstruct the scrape state. The envelope captures the failed replay step,
`pageUrl`, and `screenshot`.

The `replay-fault` container (`http://replay-fault:4322`) serves a button on
visit 1 and removes it on visit 2+, keyed by `?token=`. Using a unique token
per run guarantees visit 1 is the scrape and visit 2 is the interact.

```bash
# Generate a unique token so visit counts start fresh
F5A_TOKEN="f5a-$(date +%s)"

# Step 1: scrape — visit 1 has the button and the scrape action clicks it
curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"url\": \"http://replay-fault:4322/replay-fault/element?token=${F5A_TOKEN}\", \"origin\": \"website\", \"actions\": [{\"type\": \"click\", \"selector\": \"#replay-btn\"}]}" \
  > /tmp/F5a-scrape.json

jq '{success, scrape_id, action_clicked: (.data.markdown | test("Button clicked successfully"))}' /tmp/F5a-scrape.json
F5A_ID=$(jq -r '.scrape_id' /tmp/F5a-scrape.json)

# Step 2: interact — visit 2 has no button; replay fails before this code runs
curl -sS -X POST "http://localhost:3002/v2/scrape/${F5A_ID}/interact" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"code": "console.log(\"interact code should not run before replay failure\")"}' \
  > /tmp/F5a-interact.json

jq '{
  success, code, error,
  replayFailedAt: .details.replayFailedAt,
  stderrSnippet: .details.stderrSnippet,
  pageUrl: .details.pageUrl,
  screenshotLen: (.details.screenshot | length // 0)
}' /tmp/F5a-interact.json
```

PASS:
- Scrape: `success: true`, `action_clicked: true`, `scrape_id` is non-null
- Interact: `success: false`
- `code: "BROWSER_EXECUTION_FAILED"`
- `error` is `"Failed to initialize browser session from the original scrape context. Please rerun the scrape and try again."`
- `replayFailedAt` is `{ "actionIndex": 1, "actionType": "click" }`
- `stderrSnippet` contains `Replay action #1 (click)`
- **`pageUrl`** is `"http://replay-fault:4322/replay-fault/element?token=f5a-..."` ← proves which page was open when the click failed
- **`screenshotLen > 1000`** ← screenshot captured showing the page without the button

Cleanup:
```bash
curl -sS -X DELETE "http://localhost:3002/v2/scrape/${F5A_ID}/interact" -H "$AUTH" > /dev/null
```

---

### Test F5b — Replay fault: route removed between scrape and interact

Verifies that when a URL returns 200 at scrape time but 404 on replay
navigation, the error envelope captures `pageUrl` and `screenshot` of the
404 page so the developer knows the route was gone — not that the element was
wrong.

The `replay-fault` server returns 200 on visit 1 and 404 on visit 2+ for
`/replay-fault/route`.

```bash
F5B_TOKEN="f5b-$(date +%s)"

# Step 1: scrape — visit 1 is 200 OK
curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"url\": \"http://replay-fault:4322/replay-fault/route?token=${F5B_TOKEN}\", \"origin\": \"website\"}" \
  > /tmp/F5b-scrape.json

jq '{success, scrape_id, title: .data.metadata.title}' /tmp/F5b-scrape.json
F5B_ID=$(jq -r '.scrape_id' /tmp/F5b-scrape.json)

# Step 2: interact — visit 2 returns 404; waiting for original content must time out
curl -sS -X POST "http://localhost:3002/v2/scrape/${F5B_ID}/interact" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"code\": \"await page.goto('http://replay-fault:4322/replay-fault/route?token=${F5B_TOKEN}'); await page.waitForSelector('#visit-count', {timeout: 5000});\"}" \
  > /tmp/F5b-interact.json

jq '{
  success, code, error,
  pageUrl: .details.pageUrl,
  screenshotLen: (.details.screenshot | length // 0)
}' /tmp/F5b-interact.json
```

PASS:
- Scrape: `success: true`, `title: "Replay Fault — Route"`, `scrape_id` is non-null
- Interact: `success: false`
- `code: "BROWSER_EXECUTION_FAILED"`
- **`pageUrl`** is `"http://replay-fault:4322/replay-fault/route?token=f5b-..."` ← proves which URL was open (the now-404 route)
- **`screenshotLen > 1000`** ← screenshot captured showing the 404 page

Cleanup:
```bash
curl -sS -X DELETE "http://localhost:3002/v2/scrape/${F5B_ID}/interact" -H "$AUTH" > /dev/null
```

---

## Section C — Final teardown

```bash
docker compose -f docker-compose.yaml -f docker-compose.playground.yaml down
```

---

## Reporting (under 600 words)

For each test (S1-S4, F1-F4, F5a-F5b):
- PASS / FAIL
- The verbatim output from the `jq` block
- If FAIL: which specific criterion didn't match, and your best hypothesis for
  the cause (do NOT try to fix)

Then summarize:
- **Engine health** (Section A): did the playwright-service produce real
  screenshots and content? If S2 failed, the rest of the failure-mode
  screenshots may be untrustworthy.
- **Envelope coverage** (Section B): are all four customer-visible failure
  modes returning the rich envelope?
- **Real-world replay faults** (F5a/F5b): did the `replay-fault` container
  correctly simulate element-disappears and route-removed scenarios, and did
  the API return `pageUrl` + `screenshot` in both cases?
- **Concerns about demo-readiness**: anything in `docker compose logs api
  --tail 40` that looks like a real error?

---

## Constraints

- Read-only. No code edits, migrations, or force-pushes.
- If a test fails, capture output and STOP — don't try to debug.
- If the stack fails to start, dump logs and stop.
- Do NOT run the broader Firecrawl test suite (e.g., snips, e2e). Only the
  tests in this document.
- Order: run S1-S4 first (engine sanity), then F1-F4 (envelope verification),
  then F5a-F5b (real-world replay faults). Failing engine sanity invalidates
  the failure tests. F5a/F5b require the `replay-fault` container (included in
  the playground stack) and use a unique `?token=` per run — never reuse tokens.
