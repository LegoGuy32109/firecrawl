import { describe, expect, it } from "vitest";
import { resolvePlaygroundLiveViewUrl } from "./live-view-url";

describe("resolvePlaygroundLiveViewUrl", () => {
  it("anchors relative session urls under the playground path", () => {
    expect(
      resolvePlaygroundLiveViewUrl("./session/abc/view", {
        origin: "http://localhost:3002",
        pathname: "/admin/key/playground",
      }),
    ).toBe("http://localhost:3002/admin/key/playground/session/abc/view");
  });

  it("preserves absolute urls", () => {
    expect(
      resolvePlaygroundLiveViewUrl("/admin/key/playground/session/abc/view", {
        origin: "http://localhost:3002",
        pathname: "/admin/key/playground",
      }),
    ).toBe("http://localhost:3002/admin/key/playground/session/abc/view");
  });
});
