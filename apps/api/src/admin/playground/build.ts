import { copyFileSync, mkdirSync } from "fs";
import { join } from "path";
import { build } from "esbuild";

const cwd = process.cwd();
const distDir = join(cwd, "dist");
const bundlePath = join(distDir, "playground.bundle.js");
const cssSrc = join(cwd, "src/admin/playground/client/playground.css");
const cssOut = join(distDir, "playground.css");

async function main() {
  mkdirSync(distDir, { recursive: true });

  await build({
    entryPoints: [join(cwd, "src/admin/playground/client/index.tsx")],
    bundle: true,
    platform: "browser",
    jsx: "automatic",
    jsxImportSource: "preact",
    format: "iife",
    minify: true,
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
      "react-dom/jsx-runtime": "preact/jsx-runtime",
    },
    outfile: bundlePath,
  });

  copyFileSync(cssSrc, cssOut);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
