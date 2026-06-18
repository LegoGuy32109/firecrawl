import { readFileSync } from "fs";
import { join } from "path";
import { Request, Response } from "express";
import { config } from "../../config";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// process.cwd() is apps/api/ in both tsx (harness) and compiled modes
const bundlePath = join(process.cwd(), "dist", "playground.bundle.js");

let bundle: string;
try {
  bundle = readFileSync(bundlePath, "utf8");
} catch {
  throw new Error(
    `Playground bundle not found at ${bundlePath}\nRun \`pnpm build:playground\` then restart.`,
  );
}

const safeEnv = escapeHtml(config.ENV ?? "unknown");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Firecrawl Playground</title>
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

    #root {
      width: min(1400px, calc(100vw - 24px));
      margin: 0 auto;
      padding: 16px 0;
    }
  </style>
</head>
<body>
  <div id="root" data-env="${safeEnv}"></div>
<script>${bundle}</script>
</body>
</html>`;

export function playgroundController(_req: Request, res: Response) {
  res
    .status(200)
    .setHeader("Content-Type", "text/html; charset=utf-8")
    .setHeader("Referrer-Policy", "no-referrer")
    .send(html);
}
