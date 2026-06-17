import { Request, Response } from "express";
import { config } from "../config";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type AdminRoute = {
  method: "GET" | "POST";
  path: string;
  label: string;
  description: string;
  linked?: boolean;
};

const keyedRoutes: AdminRoute[] = [
  {
    method: "GET",
    path: "",
    label: "Admin index",
    description: "This landing page for existing admin routes.",
    linked: true,
  },
  {
    method: "GET",
    path: "/playground",
    label: "Playground",
    description: "Interactive API playground with live error diagnostics.",
    linked: true,
  },
  {
    method: "GET",
    path: "/queues",
    label: "Bull Board",
    description: "Inspect BullMQ queues registered by the API process.",
    linked: true,
  },
  {
    method: "GET",
    path: "/redis-health",
    label: "Redis health",
    description: "Check Redis connectivity used by the API.",
    linked: true,
  },
  {
    method: "GET",
    path: "/autumn-health",
    label: "Autumn health",
    description: "Check billing service connectivity.",
    linked: true,
  },
  {
    method: "GET",
    path: "/feng-check",
    label: "Fire Engine check",
    description: "Run the existing Fire Engine health check.",
    linked: true,
  },
  {
    method: "GET",
    path: "/cclog",
    label: "Credit/concurrency log",
    description: "View the existing cclog admin output.",
    linked: true,
  },
  {
    method: "GET",
    path: "/index-queue-prometheus",
    label: "Index queue Prometheus",
    description: "Prometheus-format metrics for index queues.",
    linked: true,
  },
  {
    method: "GET",
    path: "/precrawl",
    label: "Trigger precrawl",
    description: "Run the existing precrawl admin handler.",
    linked: true,
  },
  {
    method: "GET",
    path: "/metrics",
    label: "Metrics",
    description: "Prometheus-format API/admin metrics.",
    linked: true,
  },
  {
    method: "GET",
    path: "/nuq-metrics",
    label: "NuQ metrics",
    description: "Prometheus-format NuQ queue metrics.",
    linked: true,
  },
  {
    method: "POST",
    path: "/acuc-cache-clear",
    label: "Clear ACUC cache",
    description: "POST-only cache clear operation.",
  },
  {
    method: "POST",
    path: "/fsearch",
    label: "Realtime search",
    description: "POST-only realtime search admin operation.",
  },
  {
    method: "POST",
    path: "/concurrency-queue-backfill",
    label: "Concurrency queue backfill",
    description: "POST-only backfill operation.",
  },
  {
    method: "POST",
    path: "/crawl-monitor",
    label: "Crawl monitor",
    description: "POST-only crawl monitor operation.",
  },
];

const unkeyedRoutes: AdminRoute[] = [
  {
    method: "POST",
    path: "/admin/integration/create-user",
    label: "Integration create user",
    description: "POST-only integration admin proxy route.",
  },
  {
    method: "POST",
    path: "/admin/integration/validate-api-key",
    label: "Integration validate API key",
    description: "POST-only integration admin proxy route.",
  },
  {
    method: "POST",
    path: "/admin/integration/rotate-api-key",
    label: "Integration rotate API key",
    description: "POST-only integration admin proxy route.",
  },
];

const renderRouteRows = (basePath: string, routes: AdminRoute[]): string =>
  routes
    .map(route => {
      const fullPath = route.path.startsWith("/admin/")
        ? route.path
        : `${basePath}${route.path}`;
      const safeFullPath = escapeHtml(fullPath);
      const routeTarget =
        route.linked && route.method === "GET"
          ? `<a href="${safeFullPath}">${safeFullPath}</a>`
          : `<code>${safeFullPath}</code>`;

      return `<tr>
        <td><span class="method ${route.method.toLowerCase()}">${route.method}</span></td>
        <td>${escapeHtml(route.label)}</td>
        <td>${routeTarget}</td>
        <td>${escapeHtml(route.description)}</td>
      </tr>`;
    })
    .join("");

export function adminIndexController(req: Request, res: Response) {
  const basePath = req.path.replace(/\/$/, "");
  const safeEnv = escapeHtml(config.ENV ?? "");
  const safeBasePath = escapeHtml(basePath);
  const safeBullAuthKey = escapeHtml(config.BULL_AUTH_KEY ?? "");

  res
    .status(200)
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .setHeader("Referrer-Policy", "no-referrer").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Firecrawl Admin</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080a0f;
      --panel: #10151d;
      --panel-strong: #151c26;
      --ink: #eef3f8;
      --muted: #8995a3;
      --line: #26313d;
      --accent: #ff6a3d;
      --accent-soft: #26150f;
      --get: #187a52;
      --post: #a66516;
      --field: #0b1017;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-height: 100vh;
      background: linear-gradient(180deg, #0d1219 0%, var(--bg) 42%, #05070a 100%);
      color: var(--ink);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height: 1.45;
    }

    main {
      width: min(1120px, calc(100vw - 40px));
      margin: 0 auto;
      padding: 24px 0;
    }

    header {
      display: grid;
      gap: 16px;
      margin-bottom: 18px;
      padding: 16px 0;
      border-bottom: 1px solid var(--line);
    }

    h1 {
      margin: 0;
      font-size: 18px;
      line-height: 1.1;
      letter-spacing: -0.02em;
    }

    .top-fields {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    input {
      width: 100%;
      min-width: 0;
      padding: 10px 11px;
      border: 1px solid var(--line);
      border-radius: 0;
      background: var(--field);
      color: var(--ink);
      font: 13px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    section {
      margin-top: 16px;
      border: 1px solid var(--line);
      border-radius: 0;
      background: var(--panel);
      box-shadow: none;
      overflow: hidden;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      background: var(--panel-strong);
    }

    h2 {
      margin: 0;
      font-size: 16px;
      letter-spacing: -0.02em;
    }

    .section-note {
      margin: 2px 0 0;
      color: var(--muted);
      font-size: 12px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      padding: 13px 16px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }

    th {
      color: var(--muted);
      font: 700 12px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    tr:last-child td { border-bottom: 0; }

    a {
      color: var(--accent);
      font-weight: 700;
      text-decoration: none;
    }

    a:hover { text-decoration: underline; }

    code {
      font: 13px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      word-break: break-word;
    }

    .method {
      display: inline-block;
      min-width: 48px;
      padding: 4px 7px;
      border-radius: 0;
      color: #fff;
      font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      text-align: center;
    }

    .method.get { background: var(--get); }
    .method.post { background: var(--post); }

    .warning {
      margin-top: 22px;
      padding: 14px 16px;
      border: 1px solid #573121;
      border-radius: 0;
      background: var(--accent-soft);
      color: #ffb196;
      font-size: 14px;
    }

    @media (max-width: 760px) {
      main {
        width: min(100vw - 24px, 1120px);
        padding: 28px 0;
      }

      .top-fields {
        grid-template-columns: 1fr;
      }

      table, thead, tbody, tr, th, td {
        display: block;
      }

      thead { display: none; }

      tr {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
      }

      tr:last-child { border-bottom: 0; }

      td {
        padding: 5px 0;
        border: 0;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Firecrawl Admin</h1>
      <div class="top-fields">
        <label>ENV <input readonly value="${safeEnv}"></label>
        <label>Base <input readonly value="${safeBasePath}"></label>
        <label>Path key <input readonly value="${safeBullAuthKey}"></label>
      </div>
    </header>

    <section>
      <div class="section-header">
        <div>
          <h2>Keyed Admin Routes</h2>
          <p class="section-note">Routes under the existing <code>/admin/:BULL_AUTH_KEY</code> pattern.</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Name</th>
            <th>Route</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          ${renderRouteRows(basePath, keyedRoutes)}
        </tbody>
      </table>
    </section>

    <section>
      <div class="section-header">
        <div>
          <h2>Integration Admin Routes</h2>
          <p class="section-note">Existing unkeyed POST proxy routes. They are listed for discoverability, not linked as browser navigations.</p>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Name</th>
            <th>Route</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          ${renderRouteRows(basePath, unkeyedRoutes)}
        </tbody>
      </table>
    </section>

    <div class="warning">
      This admin area is protected by the existing path-secret pattern, not user authentication. Do not expose it on an untrusted network without an auth proxy, VPN, or equivalent access control.
    </div>
  </main>
</body>
</html>`);
}
