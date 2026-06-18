// @vitest-environment jsdom

import { h, render } from "preact";
import { describe, expect, it } from "vitest";
import {
  activeFeature,
  requestBody,
  inflight,
  sessionId,
  liveViewUrl,
} from "../signals";
import { InteractRequestBuilder } from "./InteractRequestBuilder";

function resetState() {
  activeFeature.value = "interact";
  requestBody.value = {
    jobId: "123e4567-e89b-12d3-a456-426614174000",
    code: "console.log('hi')",
    language: "node",
    timeout: 30,
  };
  inflight.value = false;
  sessionId.value = null;
  liveViewUrl.value = null;
}

describe("InteractRequestBuilder", () => {
  beforeEach(() => {
    resetState();
  });

  it("renders the interact form without throwing", () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    render(h(InteractRequestBuilder, {}), root);

    expect(root.textContent).toContain("Job ID");
    expect(root.textContent).toContain("Language");
    expect(root.textContent).toContain("Run interact");
    expect(root.querySelectorAll("option").length).toBeGreaterThan(0);

    render(null, root);
    root.remove();
  });
});
