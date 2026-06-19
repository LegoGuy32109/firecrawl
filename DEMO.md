# velvet-comet — Demo Guide

> **Customer Feedback #7:** "was it step three or step eleven? Re-run and squint, that's our debugging strategy."

## What was built

When a scrape-and-interact replay fails, Firecrawl now returns a structured error envelope so you can see **exactly** what happened — without re-running anything.

```json
{
  "success": false,
  "code": "BROWSER_EXECUTION_FAILED",
  "error": "page.click: Timeout 30000ms exceeded. waiting for locator('#replay-btn')",
  "details": {
    "pageUrl": "http://example.com/checkout",
    "screenshot": "<base64 JPEG of the page at the moment of failure>",
    "replayFailedAt": { "actionIndex": 2, "actionType": "click" },
    "stderrSnippet": "Replay action #2 (click): element not found"
  }
}
```

Before this change, a failure returned only a generic error message. The developer had no idea which step failed, what the page looked like, or whether the URL had changed. They had to re-run the scrape, replay the actions manually, and guess.

---

## Stack

```bash
cd apps/api
pnpm dev:local
```

Playground UI → `http://localhost:3002/admin/playground-local/playground`

Auth key (pre-filled in the UI): `fc-3d478a296e59403e85c794aba81ffd2a`

---

## Demo A — Scrape action replay fails in Interact (UI walkthrough)

Shows the actual issue #7 path: the original scrape action succeeds, then
Interact tries to reconstruct that scrape state by replaying the saved action
against a changed page. The replay fails before the interact code runs, and the
Interact tab shows which replay action failed.

Use a fresh token for every run:
```
demo-1750000000
```

**Step 1: Scrape** — paste this URL into the scrape URL field:
```
http://replay-fault:4322/replay-fault/element?token=demo-1750000000
```

Add one scrape action:
```json
{ "type": "click", "selector": "#replay-btn" }
```

Run the scrape. It should succeed. The response markdown should include:
```
Button clicked successfully during scrape actions
```

That proves the button existed and the scrape action was good on visit 1.

**Step 2: Interact** — open the Interact tab for that scrape. Select the scrape
from Existing scrape if needed.

If it shows **Live session**, click **End live session** or choose **Force new
replay**. The point of this demo is to force Interact to reconstruct the browser
from saved scrape actions after no usable live session exists.

Choose **Replay from scrape** or **Force new replay**, then paste harmless code:
```javascript
console.log("If you see this, replay did not fail first");
```

**What you see:** The Interact error view says:

```
Replay reconstruction failed at action 1 (click)
```

It also shows:
- `code: BROWSER_EXECUTION_FAILED`
- `details.replayFailedAt.actionIndex: 1`
- `details.replayFailedAt.actionType: "click"`
- a screenshot of visit 2, where the page says the button was removed
- the page URL, proving the replay was on the expected page

This is different from a code-execution failure: the user code never gets to run.

---

## Demo A2 — Same page, code execution failure only

This is the older proof path and is useful as a contrast. It does **not** prove
scrape-action replay failed; it only proves interact code errors are rendered.

**Step 1: Scrape** — paste into the URL field, hit Scrape.
```
http://replay-fault:4322/replay-fault/element?token=demo-code-001
```

**Step 2: Interact** — paste this code and run:
```javascript
await page.goto('http://replay-fault:4322/replay-fault/element?token=demo-code-001');
await page.click('#replay-btn');
```

**What you see:** The error view shows the screenshot and missing selector, but
the headline is `Interact code failed`, not `Replay reconstruction failed...`.

---

## Demo B — Route removed (CLI)

Shows the envelope capturing a 404 page in a screenshot.

```bash
AUTH='Authorization: Bearer fc-3d478a296e59403e85c794aba81ffd2a'
TOKEN="route-$(date +%s)"

# Visit 1: scrape returns 200
SCRAPE=$(curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"url\":\"http://replay-fault:4322/replay-fault/route?token=${TOKEN}\",\"origin\":\"website\"}")
ID=$(echo "$SCRAPE" | jq -r '.scrape_id')
echo "Scrape OK — $ID"

# Visit 2: interact navigates back — server returns 404
curl -sS -X POST "http://localhost:3002/v2/scrape/${ID}/interact" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d "{\"code\":\"await page.goto('http://replay-fault:4322/replay-fault/route?token=${TOKEN}'); await page.waitForSelector('#visit-count',{timeout:5000});\"}" \
  | jq '{
      success,
      code,
      error,
      pageUrl:       .details.pageUrl,
      screenshotLen: (.details.screenshot | length)
    }'
```

Expected output:
```json
{
  "success": false,
  "code": "BROWSER_EXECUTION_FAILED",
  "error": "page.waitForSelector: Timeout 5000ms exceeded...",
  "pageUrl": "http://replay-fault:4322/replay-fault/route?token=route-...",
  "screenshotLen": 19700
}
```

The screenshot is a base64 JPEG of the 404 page — proof the route was gone, not that the selector was wrong.

---

## Demo C — Exact failed step (replayFailedAt)

Shows `replayFailedAt` identifying step 3 of a multi-step script.

```bash
AUTH='Authorization: Bearer fc-3d478a296e59403e85c794aba81ffd2a'

# Scrape any page to get a scrape_id
ID=$(curl -sS -X POST http://localhost:3002/v2/scrape \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{"url":"https://example.com","origin":"website"}' | jq -r '.scrape_id')

# Interact: 3-step script where step 3 throws a replay-tagged error
curl -sS -X POST "http://localhost:3002/v2/scrape/${ID}/interact" \
  -H 'Content-Type: application/json' -H "$AUTH" \
  -d '{
    "code": "await page.goto(\"https://example.com\"); await page.waitForSelector(\"h1\"); throw new Error(\"Replay action #3 (click): button not found\");"
  }' | jq '{
    success,
    replayFailedAt: .details.replayFailedAt,
    stderrSnippet:  .details.stderrSnippet
  }'
```

Expected output:
```json
{
  "success": false,
  "replayFailedAt": { "actionIndex": 3, "actionType": "click" },
  "stderrSnippet": "Replay action #3 (click): button not found"
}
```

---

## How the replay-fault server works

`apps/test-site/replay-fault-server.mjs` is a zero-dependency Node.js server that tracks visit counts per `?token=` in memory.

| Route | Visit 1 | Visit 2+ |
|---|---|---|
| `/replay-fault/element?token=X` | 200 + `<button id="replay-btn">` | 200, button removed |
| `/replay-fault/route?token=X` | 200 | 404 |

State resets when the container restarts. **Always use a fresh token per run.**

---

## Vertical slice summary

| Area | Files |
|---|---|
| Playwright service error capture | `apps/playwright-service-ts/api.ts` |
| API error envelope assembly | `apps/api/src/scraper/scrapeURL/engines/playwright/scrape-browser.ts` |
| HTTP response surface | `apps/api/src/controllers/v2/interact.ts` |
| Playground UI — interact panel | `apps/api/src/admin/playground/client/components/InteractRequestBuilder.tsx` |
| Playground UI — error display | `apps/api/src/admin/playground/client/components/ErrorView.tsx` |
| Playground UI — success seam | `apps/api/src/admin/playground/client/components/SuccessView.tsx` |
| Test infrastructure | `apps/test-site/replay-fault-server.mjs`, `docker-compose.dev.yaml`, `docker-compose.playground.yaml` |
| Verification tests | `cli-verification-tests.md` |
