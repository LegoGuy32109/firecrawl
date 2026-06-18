// @vitest-environment jsdom

import { h, render } from "preact";
import {
  activeFeature,
  activeView,
  historyEntries,
  requestBody,
  requestDockMode,
  lastVisibleDockMode,
  requestDrafts,
  requestRailWidth,
} from "../signals";
import { ResponseHistory } from "./ResponseHistory";
import { getDefaultState } from "../history";

function resetState() {
  const defaults = getDefaultState();
  activeFeature.value = "scrape";
  activeView.value = "history";
  requestDockMode.value = "left";
  lastVisibleDockMode.value = "left";
  requestRailWidth.value = 420;
  requestBody.value = {};
  requestDrafts.value = defaults.drafts;
  historyEntries.value = [];
  window.localStorage.clear();
}

describe("ResponseHistory", () => {
  beforeEach(() => {
    resetState();
  });

  it("shows history rows, exposes network errors, and toggles entry content", async () => {
    historyEntries.value = [
      {
        id: "row-1",
        feature: "scrape",
        method: "POST",
        endpoint: "/v2/scrape",
        requestBody: { url: "https://example.com" },
        target: "example.com",
        status: 0,
        errorMessage: "offline",
        body: { error: "offline" },
        startedAt: 1,
        completedAt: 2,
        durationMs: 1,
        warningCount: 0,
        pending: false,
        persisted: true,
        ui: {
          open: false,
          panel: "response",
          responseTab: "response",
        },
      },
    ];

    const root = document.createElement("div");
    document.body.appendChild(root);
    render(h(ResponseHistory, {}), root);

    expect(root.textContent).toContain("History (1)");
    expect(root.textContent).toContain("Network error");
    expect(root.textContent).toContain("scrape");
    expect(root.textContent).toContain("example.com");

    const header = root.querySelector('[role="button"]') as HTMLElement;
    expect(header).toBeTruthy();
    header.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    await Promise.resolve();

    const requestTab = Array.from(root.querySelectorAll("button")).find(
      button => button.textContent === "Request",
    ) as HTMLButtonElement | undefined;
    expect(requestTab).toBeTruthy();
    requestTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(root.textContent).toContain("Restore request");
    expect(root.textContent).toContain("Request");

    render(null, root);
    root.remove();
  });
});
