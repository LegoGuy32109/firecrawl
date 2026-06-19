// @vitest-environment jsdom

import { h, render } from "preact";
import { describe, expect, it, afterEach } from "vitest";
import { ErrorView } from "./ErrorView";

let root: HTMLDivElement;

function mount(body: Record<string, unknown>) {
  root = document.createElement("div");
  document.body.appendChild(root);
  render(h(ErrorView, { body }), root);
  return root;
}

afterEach(() => {
  if (root) {
    render(null, root);
    root.remove();
  }
});

describe("ErrorView — failure frame (SCRAPE_ACTION_ERROR)", () => {
  it("shows headline with selector when present", () => {
    mount({
      code: "SCRAPE_ACTION_ERROR",
      details: {
        actionIndex: 3,
        selector: ".product-card-add",
        pageUrl: "https://example.com",
      },
    });
    expect(root.textContent).toContain("Action 3 failed: .product-card-add");
  });

  it("shows headline without selector when absent", () => {
    mount({
      code: "SCRAPE_ACTION_ERROR",
      details: { actionIndex: 1, pageUrl: "https://example.com" },
    });
    expect(root.textContent).toContain("Action 1 failed");
    expect(root.textContent).not.toContain("failed:");
  });

  it("shows screenshot img when present", () => {
    mount({
      code: "SCRAPE_ACTION_ERROR",
      details: {
        actionIndex: 0,
        screenshot: "abc123",
        pageUrl: "https://example.com",
      },
    });
    const img = root.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.src).toContain("data:image/jpeg;base64,abc123");
  });

  it("shows placeholder when screenshot is absent but other detail fields exist", () => {
    mount({
      code: "SCRAPE_ACTION_ERROR",
      details: { actionIndex: 2, selector: ".btn" },
    });
    // Falls into failure frame because actionIndex is present
    expect(root.textContent).toContain("Action 2 failed: .btn");
    expect(root.textContent).toContain("screenshot unavailable");
  });

  it("renders body.error message in the failure frame", () => {
    mount({
      code: "SCRAPE_ACTION_ERROR",
      error: "Timeout 30000ms exceeded waiting for selector .product-card-add",
      details: {
        actionIndex: 3,
        selector: ".product-card-add",
        pageUrl: "https://example.com",
      },
    });
    expect(root.textContent).toContain("Timeout 30000ms exceeded");
  });

  it("shows URL caption when pageUrl is present", () => {
    mount({
      code: "SCRAPE_ACTION_ERROR",
      details: { actionIndex: 0, pageUrl: "https://example.com/checkout" },
    });
    expect(root.textContent).toContain("https://example.com/checkout");
  });

  it("does not enter failure frame when details has no recognized fields", () => {
    mount({
      code: "SCRAPE_ACTION_ERROR",
      details: {},
    });
    // Falls back to generic error view — no headline chip structure
    expect(root.querySelector(".playground-failure__headline")).toBeNull();
  });
});

describe("ErrorView — failure frame (BROWSER_EXECUTION_FAILED)", () => {
  it("shows 'Interact code failed' headline when replayFailedAt is absent", () => {
    mount({
      code: "BROWSER_EXECUTION_FAILED",
      details: {
        exitCode: 1,
        stderrSnippet: "Error: intentional",
        pageUrl: "https://example.com",
      },
    });
    expect(root.textContent).toContain("Interact code failed");
  });

  it("shows stderr snippet in a pre block", () => {
    mount({
      code: "BROWSER_EXECUTION_FAILED",
      details: {
        exitCode: 1,
        stderrSnippet: "Error: page.click failed",
        pageUrl: "https://example.com",
      },
    });
    const pre = root.querySelector("pre");
    expect(pre?.textContent).toContain("Error: page.click failed");
  });

  it("shows replay reconstruction headline when replayFailedAt is populated", () => {
    mount({
      code: "BROWSER_EXECUTION_FAILED",
      details: {
        exitCode: 1,
        replayFailedAt: { actionIndex: 7, actionType: "click" },
        pageUrl: "https://example.com",
      },
    });
    expect(root.textContent).toContain(
      "Replay reconstruction failed at action 7 (click)",
    );
  });

  it("enters failure frame via exitCode alone (no screenshot or pageUrl)", () => {
    mount({
      code: "BROWSER_EXECUTION_FAILED",
      details: { exitCode: 1, stderrSnippet: "err" },
    });
    expect(root.querySelector(".playground-failure__headline")).toBeTruthy();
    expect(root.textContent).toContain("screenshot unavailable");
  });
});

describe("ErrorView — diagnostics waterfall fallback", () => {
  const step = (name: string, status: string) => ({ name, status });

  it("prefers non-empty actions over steps", () => {
    mount({
      code: "SCRAPE_ACTION_ERROR",
      details: { actionIndex: 0, pageUrl: "https://example.com" },
      diagnostics: {
        actions: [
          step("Action 0 (wait)", "ok"),
          step("Action 1 (click)", "failed"),
        ],
        steps: [step("old step", "ok")],
      },
    });
    expect(root.textContent).toContain("Action 0 (wait)");
    expect(root.textContent).not.toContain("old step");
  });

  it("falls back to steps when actions is empty", () => {
    mount({
      code: "SCRAPE_ACTION_ERROR",
      details: { actionIndex: 0, pageUrl: "https://example.com" },
      diagnostics: {
        actions: [],
        steps: [step("scrape step", "ok")],
      },
    });
    expect(root.textContent).toContain("scrape step");
  });
});

describe("ErrorView — fallback path (other codes)", () => {
  it("renders generic layout for unknown codes", () => {
    mount({
      code: "RATE_LIMIT_EXCEEDED",
      details: { limit: 10, remaining: 0, reset_at: "soon" },
    });
    expect(root.querySelector(".playground-failure__headline")).toBeNull();
    expect(root.textContent).toContain("RATE_LIMIT_EXCEEDED");
  });
});
