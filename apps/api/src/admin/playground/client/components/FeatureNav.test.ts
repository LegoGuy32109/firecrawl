// @vitest-environment jsdom

import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import { activeFeature, activeView } from "../signals";
import { FeatureNav } from "./FeatureNav";

function resetState() {
  activeFeature.value = "scrape";
  activeView.value = "history";
}

describe("FeatureNav", () => {
  beforeEach(() => {
    resetState();
  });

  it("moves out of history when switching features", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);
    render(h(FeatureNav, {}), root);

    const interactTab = Array.from(root.querySelectorAll("button")).find(
      button => button.textContent === "Interact",
    ) as HTMLButtonElement | undefined;
    expect(interactTab).toBeTruthy();
    interactTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(activeFeature.value).toBe("interact");
    expect(activeView.value).toBe("interact");

    render(null, root);
    root.remove();
  });

  it("switches back to scrape from history", async () => {
    activeFeature.value = "interact";
    activeView.value = "history";

    const root = document.createElement("div");
    document.body.appendChild(root);
    render(h(FeatureNav, {}), root);

    const scrapeTab = Array.from(root.querySelectorAll("button")).find(
      button => button.textContent === "Scrape",
    ) as HTMLButtonElement | undefined;
    expect(scrapeTab).toBeTruthy();
    scrapeTab?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(activeFeature.value).toBe("scrape");
    expect(activeView.value).toBe("scrape");

    render(null, root);
    root.remove();
  });
});
