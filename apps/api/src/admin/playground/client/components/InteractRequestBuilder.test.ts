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

  it("renders existing scrape status and run mode controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        json: async () => ({
          success: true,
          scrapes: [
            {
              id: BASE_BODY.jobId,
              url: "https://example.com/session",
              createdAt: "2026-06-19T12:00:00.000Z",
              isSuccessful: true,
              error: null,
              actionsCount: 2,
              waitForMs: 500,
              creditsUsed: 1,
              replayAvailable: true,
              statusLabel: "Live session",
              session: {
                id: "session-id",
                browserId: "browser-id",
                status: "active",
                createdAt: "2026-06-19T12:00:00.000Z",
                updatedAt: "2026-06-19T12:01:00.000Z",
                creditsUsed: null,
                liveViewUrl: "/admin/key/playground/session/browser-id/view",
              },
            },
          ],
        }),
        text: async () => "{}",
      })),
    );

    mountInteract();
    await new Promise(r => setTimeout(r, 20));

    expect(root.textContent).toContain("Live session");
    expect(root.textContent).toContain("Use live session");
    expect(root.textContent).toContain("Force new replay");
    expect(root.textContent).toContain("Session status");
  });
});

describe("InteractRequestBuilder — Stop lifecycle", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetState();
    fetchMock = vi.fn(async (_url, init?: RequestInit) => {
      if (init?.method === "POST") {
        return {
          status: 200,
          ok: true,
          text: async () =>
            JSON.stringify({
              success: true,
              sessionId: "sess-abc",
              result: {},
            }),
        };
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ success: true, scrapes: [] }),
        text: async () => "{}",
      };
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("Stop DELETEs the original job ID even after the draft job ID is changed", async () => {
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
    findButton("End live session").dispatchEvent(
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

  it("End live session still works after component remount (signal survives unmount)", async () => {
    // Simulate an active session without going through send()
    activeInteractJobId.value = "original-session-job";
    sessionId.value = "sess-xyz";

    mountInteract();

    // Remount the component (simulates hide/show request panel)
    unmountInteract();
    mountInteract();

    // End live session button enabled because sessionId.value is non-null
    const stopBtn = findButton("End live session");
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

  it("End live session clears live session signals on success", async () => {
    activeInteractJobId.value = "job-to-stop";
    sessionId.value = "active-session";
    liveViewUrl.value = "ws://live";

    mountInteract();
    findButton("End live session").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 20));

    expect(sessionId.value).toBeNull();
    expect(liveViewUrl.value).toBeNull();
    expect(activeInteractJobId.value).toBeNull();
  });

  it("failed End live session shows error and preserves state for retry", async () => {
    activeInteractJobId.value = "job-to-stop";
    sessionId.value = "active-session";
    liveViewUrl.value = "ws://live";

    fetchMock.mockImplementation(async (_url, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        throw new Error("network error");
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ success: true, scrapes: [] }),
        text: async () => "{}",
      };
    });

    mountInteract();
    findButton("End live session").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 20));

    // Session state preserved so user can retry
    expect(sessionId.value).toBe("active-session");
    expect(activeInteractJobId.value).toBe("job-to-stop");
    // Error surfaced in UI
    expect(root.textContent).toContain("Stop failed");
    // End live session button still enabled for retry
    expect(findButton("End live session").disabled).toBe(false);
  });

  it("successful retry after failed End live session clears all state", async () => {
    activeInteractJobId.value = "job-to-stop";
    sessionId.value = "active-session";
    liveViewUrl.value = "ws://live";

    let deleteAttempts = 0;
    fetchMock.mockImplementation(async (_url, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleteAttempts++;
        if (deleteAttempts === 1) {
          throw new Error("network error");
        }
      }
      return {
        status: 200,
        ok: true,
        json: async () => ({ success: true, scrapes: [] }),
        text: async () => "{}",
      };
    });

    mountInteract();
    findButton("End live session").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 20));
    expect(root.textContent).toContain("Stop failed");

    // Retry
    findButton("End live session").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise(r => setTimeout(r, 20));

    expect(sessionId.value).toBeNull();
    expect(activeInteractJobId.value).toBeNull();
    expect(root.textContent).not.toContain("Stop failed");
  });
});
