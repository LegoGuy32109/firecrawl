import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

type MatchMap = Map<string, number>;

const SRC_ROOT = path.resolve(__dirname, "../../");
const ERROR_CODES_PATH = path.join(SRC_ROOT, "lib", "error-codes.ts");

const ALLOWED_BARE_FAILURE_FILES = new Set<string>();

const IGNORED_PRODUCTION_FILES = new Set([
  "lib/error-codes.ts",
  "lib/error-catalog.ts",
  "lib/error-serde.ts",
  "admin/SPEC-ERRORCODES.md",
  "admin/SPEC-ERRORCODES-IMPL.md",
  "admin/SPEC-ERRORCODES-WP9-STATUS.md",
]);

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

function parseSourceFile(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function visit(node: ts.Node, fn: (node: ts.Node) => void): void {
  fn(node);
  ts.forEachChild(node, child => visit(child, fn));
}

function getRelativeFile(file: string): string {
  return path.relative(SRC_ROOT, file).replaceAll(path.sep, "/");
}

function getLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return (
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  );
}

function loadErrorCodeValues(): Set<string> {
  const sourceFile = parseSourceFile(ERROR_CODES_PATH);
  const values = new Set<string>();

  visit(sourceFile, node => {
    if (!ts.isEnumMember(node)) {
      return;
    }

    const initializer = node.initializer;
    if (
      initializer &&
      (ts.isStringLiteral(initializer) ||
        ts.isNoSubstitutionTemplateLiteral(initializer))
    ) {
      values.add(initializer.text);
    }
  });

  return values;
}

function collectMagicErrorCodeLiterals(
  files: string[],
  errorCodes: Set<string>,
): MatchMap {
  const matches: MatchMap = new Map();

  for (const file of files) {
    const relative = getRelativeFile(file);
    if (IGNORED_PRODUCTION_FILES.has(relative)) {
      continue;
    }

    const sourceFile = parseSourceFile(file);
    visit(sourceFile, node => {
      if (
        !ts.isStringLiteral(node) &&
        !ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        return;
      }

      if (!errorCodes.has(node.text)) {
        return;
      }

      const parent = node.parent;
      const isMagicComparison =
        ts.isBinaryExpression(parent) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsToken,
        ].includes(parent.operatorToken.kind) &&
        ((ts.isPropertyAccessExpression(parent.left) &&
          parent.left.name.text === "code") ||
          (ts.isPropertyAccessExpression(parent.right) &&
            parent.right.name.text === "code"));

      const isMagicSuperCall =
        ts.isCallExpression(parent) &&
        ts.isIdentifier(parent.expression) &&
        parent.expression.text === "super";

      if (!isMagicComparison && !isMagicSuperCall) {
        return;
      }

      const key = `${relative}|${getLine(sourceFile, node)}|${node.text}`;
      matches.set(key, (matches.get(key) ?? 0) + 1);
    });
  }

  return matches;
}

function collectBareFailureEnvelopeFiles(files: string[]): Set<string> {
  const matches = new Set<string>();

  for (const file of files) {
    const relative = getRelativeFile(file);
    const sourceFile = parseSourceFile(file);

    visit(sourceFile, node => {
      if (!ts.isCallExpression(node)) {
        return;
      }

      if (!ts.isPropertyAccessExpression(node.expression)) {
        return;
      }

      if (
        node.expression.name.text !== "json" &&
        node.expression.name.text !== "end"
      ) {
        return;
      }

      const statusCall = node.expression.expression;
      if (
        !ts.isCallExpression(statusCall) ||
        !ts.isPropertyAccessExpression(statusCall.expression) ||
        statusCall.expression.name.text !== "status"
      ) {
        return;
      }

      const statusArg = statusCall.arguments[0];
      if (!statusArg || !ts.isNumericLiteral(statusArg)) {
        return;
      }

      const status = Number(statusArg.text);
      if (status < 400 || status >= 600) {
        return;
      }

      if (node.expression.name.text === "end") {
        matches.add(relative);
        return;
      }

      const body = node.arguments[0];
      if (!body || !ts.isObjectLiteralExpression(body)) {
        return;
      }

      if (body.properties.length !== 1) {
        return;
      }

      const hasErrorProperty = body.properties.some(property => {
        if (!ts.isPropertyAssignment(property)) {
          return false;
        }

        const name = property.name;
        if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
          return name.text === "error";
        }

        return false;
      });

      if (!hasErrorProperty) {
        return;
      }

      matches.add(relative);
    });
  }

  return matches;
}

describe("Error code and failure-envelope regressions", () => {
  it("does not allow magic-string error code comparisons", () => {
    const sourceFiles = [
      ...walkSourceFiles(path.join(SRC_ROOT, "controllers")),
      ...walkSourceFiles(path.join(SRC_ROOT, "routes")),
      ...walkSourceFiles(path.join(SRC_ROOT, "scraper")),
      ...walkSourceFiles(path.join(SRC_ROOT, "lib")),
    ];

    const actual = collectMagicErrorCodeLiterals(
      sourceFiles,
      loadErrorCodeValues(),
    );

    expect([...actual.entries()].sort()).toEqual([]);
  });

  it("keeps bare v2 failure envelopes limited to the known legacy files", () => {
    const sourceFiles = [
      ...walkSourceFiles(path.join(SRC_ROOT, "controllers", "v2")),
      ...walkSourceFiles(path.join(SRC_ROOT, "routes")),
    ];

    const actual = collectBareFailureEnvelopeFiles(sourceFiles);
    const unexpected = [...actual].filter(
      relative => !ALLOWED_BARE_FAILURE_FILES.has(relative),
    );

    expect(unexpected).toEqual([]);
  });

  it("keeps browser and proxy v2 failure envelopes on the response enveloper", () => {
    const sourceFiles = [
      path.join(SRC_ROOT, "controllers", "v2", "browser.ts"),
      path.join(SRC_ROOT, "controllers", "v2", "scrape-browser.ts"),
      path.join(SRC_ROOT, "controllers", "v2", "research-proxy.ts"),
      path.join(SRC_ROOT, "controllers", "v2", "support-proxy.ts"),
    ];

    const actual = collectBareFailureEnvelopeFiles(sourceFiles);

    expect([...actual].sort()).toEqual([]);
  });
});
