// @vitest-environment jsdom

import { h, render } from "preact";
import { JsonView } from "./JsonView";

describe("JsonView", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  it("copies the rendered json to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    const root = document.createElement("div");
    document.body.appendChild(root);

    render(h(JsonView, { value: { url: "https://example.com" } }), root);

    const button = Array.from(root.querySelectorAll("button")).find(
      el => el.textContent === "Copy",
    ) as HTMLButtonElement | undefined;

    expect(button).toBeTruthy();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify({ url: "https://example.com" }, null, 2),
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(root.textContent).toContain("Copied");

    render(null, root);
    root.remove();
  });

  it("escapes string values before injecting highlighted html", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    render(h(JsonView, { value: { html: "<script>alert(1)</script>" } }), root);

    const html = root.querySelector("pre")?.innerHTML ?? "";
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(/&lt;script&gt;/.test(html)).toBe(true);

    render(null, root);
    root.remove();
  });
});
