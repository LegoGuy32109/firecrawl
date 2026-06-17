import path from "node:path";
import { build, type Plugin } from "esbuild";
import { describe, expect, it } from "vitest";

const nodeBuiltins = new Set([
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "dns",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "worker_threads",
  "zlib",
]);

const browserSafetyPlugin: Plugin = {
  name: "browser-safety",
  setup(buildCtx) {
    buildCtx.onResolve({ filter: /.*/ }, args => {
      const normalized = args.path.replace(/\\/g, "/");

      if (normalized.startsWith("node:") || nodeBuiltins.has(normalized)) {
        throw new Error(`Forbidden browser import: ${args.path}`);
      }

      if (
        /(^|\/)(controllers|services|scraper|db|routes|workers|winston)(\/|$)/.test(
          normalized,
        )
      ) {
        throw new Error(`Forbidden server import: ${args.path}`);
      }

      return undefined;
    });
  },
};

async function bundleLeaf(entryFile: string) {
  const result = await build({
    entryPoints: [entryFile],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    target: "es2020",
    logLevel: "silent",
    plugins: [browserSafetyPlugin],
  });

  expect(result.outputFiles.length).toBeGreaterThan(0);
}

describe("catalog browser safety", () => {
  const root = path.resolve(__dirname, "..", "..");

  it.each(["error-codes.ts", "error-details.ts", "error-catalog.ts"])(
    "bundles %s for the browser without node/server imports",
    async file => {
      await bundleLeaf(path.join(root, file));
    },
  );
});
