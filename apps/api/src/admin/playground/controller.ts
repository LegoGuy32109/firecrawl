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
const cssPath = join(process.cwd(), "dist", "playground.css");

let bundle: string;
let css: string;
try {
  bundle = readFileSync(bundlePath, "utf8");
  css = readFileSync(cssPath, "utf8");
} catch {
  throw new Error(
    `Playground bundle not found at ${bundlePath} or ${cssPath}\nRun \`pnpm build:playground\` then restart.`,
  );
}

const safeEnv = escapeHtml(config.ENV ?? "unknown");
// This is a dummy local-playground API key, not a real credential.
// It exists only to prefill the UI and satisfy the auth middleware's UUID
// shape check during local development.
// Keep it obviously fake and never replace it with a live token.
const safeTestApiKey = escapeHtml(
  config.TEST_API_KEY ?? "fc-3d478a296e59403e85c794aba81ffd2a",
);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Firecrawl Playground</title>
  <style>${css}</style>
</head>
<body>
  <div id="root" data-env="${safeEnv}" data-default-api-key="${safeTestApiKey}"></div>
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
