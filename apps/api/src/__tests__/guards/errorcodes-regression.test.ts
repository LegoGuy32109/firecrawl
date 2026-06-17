import fs from "node:fs";
import path from "node:path";

type CountMap = Map<string, number>;

const SRC_ROOT = path.resolve(__dirname, "../../");

function walkSourceFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSourceFiles(absolute, files);
      continue;
    }

    if (!absolute.endsWith(".ts") && !absolute.endsWith(".tsx")) {
      continue;
    }

    const relative = path.relative(SRC_ROOT, absolute);
    if (relative.includes("__tests__")) {
      continue;
    }

    files.push(absolute);
  }

  return files;
}

function countMatches(files: string[], re: RegExp): CountMap {
  const counts: CountMap = new Map();

  for (const file of files) {
    const relative = path.relative(SRC_ROOT, file);
    const source = fs.readFileSync(file, "utf8");
    re.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
      const key = `${relative}|${match.slice(1).join("|")}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

describe("Error code and failure-envelope regressions", () => {
  it("does not allow magic-string error code comparisons", () => {
    const sourceFiles = [
      ...walkSourceFiles(path.join(SRC_ROOT, "controllers")),
      ...walkSourceFiles(path.join(SRC_ROOT, "scraper")),
    ];

    const actual = countMatches(
      sourceFiles,
      /\bcode\s*===\s*["'`]([A-Z_]+)["'`]/g,
    );
    expect([...actual.entries()].sort()).toEqual([]);
  });

  it("keeps raw v2 failure envelopes confined to the known baseline", () => {
    const sourceFiles = [
      ...walkSourceFiles(path.join(SRC_ROOT, "controllers", "v2")),
      ...walkSourceFiles(path.join(SRC_ROOT, "routes")),
    ];

    const actual = countMatches(
      sourceFiles,
      /res\.status\(([45]\d{2})\)\.(json\(\{\s*error|end\(\))/g,
    );
    const expected = new Map<string, number>([
      ["controllers/v2/browser.ts|400|json({ error", 1],
      ["controllers/v2/browser.ts|401|json({ error", 1],
      ["controllers/v2/crawl-cancel.ts|404|json({ error", 2],
      ["controllers/v2/crawl-cancel.ts|409|json({ error", 1],
      ["controllers/v2/crawl-cancel.ts|500|json({ error", 1],
      ["controllers/v2/research-proxy.ts|404|end()", 1],
      ["controllers/v2/research-proxy.ts|502|end()", 1],
      ["controllers/v2/research-proxy.ts|504|end()", 1],
      ["controllers/v2/support-proxy.ts|502|json({ error", 1],
      ["controllers/v2/support-proxy.ts|503|json({ error", 1],
      ["controllers/v2/support-proxy.ts|504|json({ error", 1],
    ]);

    expect([...actual.entries()].sort()).toEqual(
      [...expected.entries()].sort(),
    );
  });
});
