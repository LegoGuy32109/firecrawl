// @vitest-environment jsdom

import { h, render } from "preact";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { SuccessView } from "./SuccessView";
import {
  activeFeature,
  activeView,
  liveViewUrl,
  requestBody,
  requestDrafts,
  sessionId,
} from "../signals";

const SCRAPE_DRAFT = { url: "https://example.com", formats: ["markdown"] };
const OLD_INTERACT_DRAFT = {
  jobId: "old-job",
  code: "throw new Error('stale')",
};

function resetSignals() {
  activeFeature.value = "scrape";
  activeView.value = "scrape";
  requestBody.value = { ...SCRAPE_DRAFT };
  requestDrafts.value = {
    scrape: { ...SCRAPE_DRAFT },
    interact: { ...OLD_INTERACT_DRAFT },
  };
  liveViewUrl.value = "ws://session/old";
  sessionId.value = "old-session-id";
}

let root: HTMLDivElement;

function mount(body: Record<string, unknown>) {
  root = document.createElement("div");
  document.body.appendChild(root);
  render(h(SuccessView, { body }), root);
  return root;
}

function seamButton(): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll("button")).find(b =>
    b.textContent?.includes("Open in Interact"),
  ) as HTMLButtonElement | undefined;
}

async function clickSeam() {
  seamButton()!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await Promise.resolve();
}

afterEach(() => {
  if (root) {
    render(null, root);
    root.remove();
  }
});

describe("SuccessView — seam button visibility", () => {
  beforeEach(resetSignals);

  it("renders when scrape_id is present", () => {
    mount({ success: true, scrape_id: "abc123" });
    expect(seamButton()).toBeTruthy();
  });

  it("does not render when scrape_id is absent", () => {
    mount({ success: true });
    expect(seamButton()).toBeUndefined();
  });

  it("does not render when scrape_id is empty string", () => {
    mount({ success: true, scrape_id: "" });
    expect(seamButton()).toBeUndefined();
  });
});

describe("SuccessView — screenshot response format", () => {
  beforeEach(resetSignals);

  it("renders a screenshot tab for successful scrape responses", () => {
    mount({
      success: true,
      data: {
        screenshot: "https://example.com/screenshot.jpeg",
      },
    });

    expect(root.textContent).toContain("Screenshot");
    const image = root.querySelector(
      'img[alt="screenshot"]',
    ) as HTMLImageElement | null;
    expect(image).toBeTruthy();
    expect(image!.getAttribute("src")).toBe(
      "https://example.com/screenshot.jpeg",
    );
  });

  it("preserves root-relative screenshot URLs instead of treating them as base64", () => {
    mount({
      success: true,
      data: {
        screenshot: "/storage/v1/object/public/media/screenshot-123.jpeg",
      },
    });

    const image = root.querySelector(
      'img[alt="screenshot"]',
    ) as HTMLImageElement | null;
    expect(image).toBeTruthy();
    expect(image!.getAttribute("src")).toBe(
      "/storage/v1/object/public/media/screenshot-123.jpeg",
    );
  });
});

describe("SuccessView — diagnostics", () => {
  beforeEach(resetSignals);

  it("renders engine waterfall diagnostics from diagnostics.sources", async () => {
    mount({
      success: true,
      data: { markdown: "ok" },
      diagnostics: {
        privacy: {
          zeroDataRetention: false,
          mode: "disabled",
          reduced: false,
        },
        sources: {
          "playwright;cdp": {
            name: "source",
            status: "ok",
            message: "playwright;cdp",
          },
        },
      },
    });

    expect(root.textContent).toContain("Diag (1)");

    const diagButton = Array.from(root.querySelectorAll("button")).find(
      b => b.textContent === "Diag (1)",
    ) as HTMLButtonElement | undefined;
    expect(diagButton).toBeTruthy();
    diagButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(root.textContent).toContain("source");
    expect(root.textContent).toContain("playwright;cdp");
    expect(root.textContent).toContain("ok");
  });
});

describe("SuccessView — seam click: navigation", () => {
  beforeEach(resetSignals);

  it("switches activeFeature to interact", async () => {
    mount({ success: true, scrape_id: "abc123" });
    await clickSeam();
    expect(activeFeature.value).toBe("interact");
  });

  it("switches activeView to interact", async () => {
    mount({ success: true, scrape_id: "abc123" });
    await clickSeam();
    expect(activeView.value).toBe("interact");
  });
});

describe("SuccessView — seam click: draft management", () => {
  beforeEach(resetSignals);

  it("sets interact draft to only the new jobId (clears stale code)", async () => {
    mount({ success: true, scrape_id: "new-scrape-id" });
    await clickSeam();
    expect(requestDrafts.value.interact).toEqual({ jobId: "new-scrape-id" });
  });

  it("preserves the scrape draft (no draft corruption)", async () => {
    mount({ success: true, scrape_id: "new-scrape-id" });
    await clickSeam();
    expect(requestDrafts.value.scrape).toEqual(SCRAPE_DRAFT);
  });

  it("works when already on the interact tab (hydration guard bypass)", async () => {
    // Simulate: user is on Interact, views a scrape result from History.
    // ResponseHistory passes feature="scrape" explicitly to SuccessView.
    activeFeature.value = "interact";
    activeView.value = "history";
    requestBody.value = { ...OLD_INTERACT_DRAFT };
    root = document.createElement("div");
    document.body.appendChild(root);
    render(
      h(SuccessView, {
        body: { success: true, scrape_id: "new-scrape-id" },
        feature: "scrape",
      }),
      root,
    );
    await clickSeam();
    expect(requestBody.value).toEqual({ jobId: "new-scrape-id" });
  });
});

describe("SuccessView — seam click: live session cleared", () => {
  beforeEach(resetSignals);

  it("clears liveViewUrl", async () => {
    mount({ success: true, scrape_id: "abc123" });
    await clickSeam();
    expect(liveViewUrl.value).toBeNull();
  });

  it("clears sessionId", async () => {
    mount({ success: true, scrape_id: "abc123" });
    await clickSeam();
    expect(sessionId.value).toBeNull();
  });
});

describe("ScrapeRequestBuilder — origin injection (via fetch spy)", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetSignals();
    mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          scrape_id: "x",
          data: { markdown: "hi" },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forces origin: website in form mode even when draft has origin: api", async () => {
    // Lazy import to avoid top-level fetch issues in other suites
    const { ScrapeRequestBuilder } = await import(
      "./scrape/ScrapeRequestBuilder"
    );
    requestBody.value = { url: "https://example.com", origin: "api" };
    root = document.createElement("div");
    document.body.appendChild(root);
    render(h(ScrapeRequestBuilder, {}), root);

    const sendBtn = Array.from(root.querySelectorAll("button")).find(
      b => b.textContent === "Send",
    ) as HTMLButtonElement | undefined;
    expect(sendBtn).toBeTruthy();
    sendBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    expect(mockFetch).toHaveBeenCalled();
    const sentBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(sentBody.origin).toBe("website");
  });

  it("respects explicit origin in raw JSON mode", async () => {
    const { ScrapeRequestBuilder } = await import(
      "./scrape/ScrapeRequestBuilder"
    );
    requestBody.value = { url: "https://example.com" };
    root = document.createElement("div");
    document.body.appendChild(root);
    render(h(ScrapeRequestBuilder, {}), root);

    // Switch to raw mode
    const rawBtn = Array.from(root.querySelectorAll("button")).find(
      b => b.textContent === "Raw JSON",
    ) as HTMLButtonElement | undefined;
    expect(rawBtn).toBeTruthy();
    rawBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    // Set the raw JSON textarea with explicit origin
    const textarea = root.querySelector("textarea") as HTMLTextAreaElement;
    const rawPayload = JSON.stringify({
      url: "https://example.com",
      origin: "my-custom-origin",
    });
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(textarea, rawPayload);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();

    const sendBtn = Array.from(root.querySelectorAll("button")).find(
      b => b.textContent === "Send",
    ) as HTMLButtonElement | undefined;
    sendBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    expect(mockFetch).toHaveBeenCalled();
    const sentBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(sentBody.origin).toBe("my-custom-origin");
  });
});
