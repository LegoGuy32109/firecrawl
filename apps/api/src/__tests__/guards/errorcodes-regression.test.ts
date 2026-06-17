import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";

type MatchMap = Map<string, number>;

const SRC_ROOT = path.resolve(__dirname, "../../");
const ERROR_CODES_PATH = path.join(SRC_ROOT, "lib", "error-codes.ts");

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
      if (!ts.isObjectLiteralExpression(node)) {
        return;
      }

      const isResponsePayload = (() => {
        let current: ts.Node | undefined = node.parent;
        while (current) {
          if (ts.isCallExpression(current)) {
            const expression = current.expression;
            if (ts.isPropertyAccessExpression(expression)) {
              return (
                expression.name.text === "json" ||
                expression.name.text === "send" ||
                expression.name.text === "end"
              );
            }

            if (ts.isIdentifier(expression)) {
              return expression.text === "send";
            }
          }

          current = current.parent;
        }

        return false;
      })();

      if (!isResponsePayload) {
        return;
      }

      const props = new Map<string, ts.PropertyAssignment>();
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) {
          continue;
        }

        const name = property.name;
        if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
          props.set(name.text, property);
        }
      }

      const successProp = props.get("success");
      if (
        !successProp ||
        successProp.initializer.kind !== ts.SyntaxKind.FalseKeyword
      ) {
        return;
      }

      if (
        props.has("code") &&
        props.has("status") &&
        props.has("diagnostics")
      ) {
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

  it("keeps bare v2 failure envelopes out of response payloads", () => {
    const sourceFiles = [
      ...walkSourceFiles(path.join(SRC_ROOT, "controllers", "v2")),
      path.join(SRC_ROOT, "routes", "v2.ts"),
    ];

    const actual = collectBareFailureEnvelopeFiles(sourceFiles);

    expect([...actual].sort()).toEqual([]);
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
