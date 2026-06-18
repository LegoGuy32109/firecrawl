// @vitest-environment jsdom

import { h, render } from "preact";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  activeFeature,
  activeInteractJobId,
  requestBody,
  inflight,
  sessionId,
  liveViewUrl,
} from "../signals";
import { InteractRequestBuilder } from "./InteractRequestBuilder";

const BASE_BODY = {
  jobId: "123e4567-e89b-12d3-a456-426614174000",
  code: "console.log('hi')",
  language: "node",
  timeout: 30,
};

function resetState() {
  activeFeature.value = "interact";
  requestBody.value = { ...BASE_BODY };
  inflight.value = false;
  sessionId.value = null;
  liveViewUrl.value = null;
  activeInteractJobId.value = null;
}

let root: HTMLDivElement;

function mountInteract() {
  root = document.createElement("div");
  document.body.appendChild(root);
  render(h(InteractRequestBuilder, {}), root);
  return root;
}

function unmountInteract() {
  render(null, root);
  root.remove();
}

function findButton(label: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll("button")).find(
    b => b.textContent === label,
  ) as HTMLButtonElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (root?.isConnected) unmountInteract();
});

describe("InteractRequestBuilder — rendering", () => {
  beforeEach(resetState);

  it("renders the interact form without throwing", () => {
    mountInteract();
    expect(root.textContent).toContain("Job ID");
    expect(root.textContent).toContain("Language");
    expect(root.textContent).toContain("Run interact");
    expect(root.querySelectorAll("option").length).toBeGreaterThan(0);
  });
});

describe("InteractRequestBuilder — Stop lifecycle", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetState();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("Stop DELETEs the original job ID even after the draft job ID is changed", async () => {
    // POST returns a live session
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () =>
        JSON.stringify({ success: true, sessionId: "sess-abc", result: {} }),
    });
    // DELETE returns 200
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => "{}",
    });

    mountInteract();

    // Click Run interact — sends POST for the original job ID
    findButton("Run interact").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 30));

    // Confirm POST was made and session is active
    expect(fetchMock.mock.calls[0][0]).toContain(BASE_BODY.jobId);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(sessionId.value).toBe("sess-abc");

    // User edits the job ID field to a different value
    requestBody.value = { ...requestBody.value, jobId: "different-job-id" };
    await Promise.resolve();

    // Click Stop — must DELETE the original locked-in job ID
    findButton("Stop").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 20));

    const deleteCall = fetchMock.mock.calls.find(
      c => c[1]?.method === "DELETE",
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall![0]).toContain(BASE_BODY.jobId);
    expect(deleteCall![0]).not.toContain("different-job-id");
  });

  it("Stop still works after component remount (signal survives unmount)", async () => {
    // Simulate an active session without going through send()
    activeInteractJobId.value = "original-session-job";
    sessionId.value = "sess-xyz";

    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => "{}",
    });

    mountInteract();

    // Remount the component (simulates hide/show request panel)
    unmountInteract();
    mountInteract();

    // Stop button enabled because sessionId.value is non-null
    const stopBtn = findButton("Stop");
    expect(stopBtn.disabled).toBe(false);

    stopBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise(r => setTimeout(r, 20));

    const deleteCall = fetchMock.mock.calls.find(
      c => c[1]?.method === "DELETE",
    );
    expect(deleteCall).toBeTruthy();
    expect(deleteCall![0]).toContain("original-session-job");
    expect(sessionId.value).toBeNull();
    expect(activeInteractJobId.value).toBeNull();
  });

  it("Stop clears live session signals on success", async () => {
    activeInteractJobId.value = "job-to-stop";
    sessionId.value = "active-session";
    liveViewUrl.value = "ws://live";

    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => "{}",
    });

    mountInteract();
    findButton("Stop").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 20));

    expect(sessionId.value).toBeNull();
    expect(liveViewUrl.value).toBeNull();
    expect(activeInteractJobId.value).toBeNull();
  });

  it("failed Stop shows error and preserves state for retry", async () => {
    activeInteractJobId.value = "job-to-stop";
    sessionId.value = "active-session";
    liveViewUrl.value = "ws://live";

    fetchMock.mockRejectedValueOnce(new Error("network error"));

    mountInteract();
    findButton("Stop").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 20));

    // Session state preserved so user can retry
    expect(sessionId.value).toBe("active-session");
    expect(activeInteractJobId.value).toBe("job-to-stop");
    // Error surfaced in UI
    expect(root.textContent).toContain("Stop failed");
    // Stop button still enabled for retry
    expect(findButton("Stop").disabled).toBe(false);
  });

  it("successful retry after failed Stop clears all state", async () => {
    activeInteractJobId.value = "job-to-stop";
    sessionId.value = "active-session";
    liveViewUrl.value = "ws://live";

    // First attempt fails
    fetchMock.mockRejectedValueOnce(new Error("network error"));
    // Second attempt succeeds
    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      text: async () => "{}",
    });

    mountInteract();
    findButton("Stop").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 20));
    expect(root.textContent).toContain("Stop failed");

    // Retry
    findButton("Stop").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 20));

    expect(sessionId.value).toBeNull();
    expect(activeInteractJobId.value).toBeNull();
    expect(root.textContent).not.toContain("Stop failed");
  });
});
