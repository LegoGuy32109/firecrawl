/**
 * Standalone server for replay-fault CLI test pages.
 *
 * Run with: node replay-fault-server.mjs [port]   (default port: 4322)
 *
 * Routes (all require ?token=<unique-string>):
 *   /replay-fault/element  — 200 + button on visit 1; 200 + no button on visit 2+
 *   /replay-fault/route    — 200 on visit 1; 404 on visit 2+
 *
 * The visit counter is stored in-process (Map), so state resets when the
 * server restarts. Use a fresh --token per test run.
 */

import { createServer } from "node:http";

const visits = new Map();

function trackVisit(token) {
  const count = (visits.get(token) ?? 0) + 1;
  visits.set(token, count);
  return count;
}

function html(body, status = 200) {
  return { status, body };
}

function elementPage(token, visitCount) {
  const buttonVisible = visitCount === 1;
  const content = buttonVisible
    ? `<button id="replay-btn" type="button">Click me (only here on visit 1)</button>`
    : `<p id="button-gone">Button removed (visit ${visitCount} — element no longer in DOM)</p>`;

  return html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Replay Fault — Element</title></head>
<body>
  <h1>Replay Fault: Disappearing Element</h1>
  <p>First visit shows a button. Subsequent visits remove it — simulating a UI
  element deleted between the original scrape and the interact replay.</p>
  ${content}
  <p id="visit-count">Token: ${token} · Visit: ${visitCount}</p>
</body>
</html>`);
}

function routePage(token, visitCount) {
  if (visitCount > 1) {
    return html(
      `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>404 — Route Removed</title></head>
<body>
  <h1>404 — Page Not Found</h1>
  <p>This route existed on visit 1 but has been removed (visit ${visitCount}).</p>
  <p>Token: ${token}</p>
</body>
</html>`,
      404,
    );
  }

  return html(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Replay Fault — Route</title></head>
<body>
  <h1>Replay Fault: Vanishing Route</h1>
  <p>Returns <strong>200</strong> on the first visit and <strong>404</strong>
  on all subsequent visits — simulating a route renamed or removed between the
  original scrape and the interact replay.</p>
  <p id="visit-count">Token: ${token} · Visit: ${visitCount}</p>
</body>
</html>`);
}

const PORT = parseInt(process.argv[2] ?? process.env.PORT ?? "4322", 10);

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const token = url.searchParams.get("token") ?? "default";

  let result;

  if (url.pathname === "/replay-fault/element") {
    result = elementPage(token, trackVisit(token));
  } else if (url.pathname === "/replay-fault/route") {
    result = routePage(token, trackVisit(token));
  } else {
    result = html(`<h1>replay-fault-server</h1><p>Routes: /replay-fault/element, /replay-fault/route</p>`);
  }

  res.writeHead(result.status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(result.body);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`replay-fault-server listening on http://0.0.0.0:${PORT}`);
  console.log(`  /replay-fault/element?token=<uuid>  — disappearing button`);
  console.log(`  /replay-fault/route?token=<uuid>    — vanishing route (404 on visit 2+)`);
});
