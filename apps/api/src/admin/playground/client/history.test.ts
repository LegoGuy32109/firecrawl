import {
  clearCompletedHistory,
  createPendingEntry,
  deriveTarget,
  extractCreditsUsed,
  finalizeHistoryEntry,
  insertPendingEntry,
  normalizeWarnings,
  removeHistoryEntry,
  restoreRequestBody,
  setHistoryEntryUiState,
  type PlaygroundHistoryEntry,
} from "./history";

function completedEntry(
  overrides: Partial<PlaygroundHistoryEntry> = {},
): PlaygroundHistoryEntry {
  return {
    id: "entry-1",
    feature: "scrape",
    method: "POST",
    endpoint: "/v2/scrape",
    requestBody: { url: "https://example.com" },
    target: "example.com",
    status: 200,
    body: { success: true },
    startedAt: 1000,
    completedAt: 2000,
    durationMs: 1000,
    creditsUsed: 1,
    warningCount: 0,
    pending: false,
    ui: {
      open: false,
      panel: "response",
      responseTab: "response",
    },
    ...overrides,
  };
}

describe("playground history helpers", () => {
  it("derives row metadata and entry state helpers", () => {
    expect(
      deriveTarget("scrape", { url: "https://example.com/" }, "/v2/scrape"),
    ).toBe("example.com");
    expect(
      deriveTarget("search", { query: "firecrawl api" }, "/v2/search"),
    ).toBe("firecrawl api");
    expect(
      deriveTarget(
        "extract",
        { urls: ["https://example.com", "https://example.org"] },
        "/v2/extract",
      ),
    ).toBe("example.com +1");
    expect(
      deriveTarget(
        "agent",
        { agentPrompt: "summarize the latest crawl results" },
        "/v2/agent",
      ),
    ).toBe("summarize the latest crawl results");

    expect(extractCreditsUsed({ data: { metadata: { creditsUsed: 3 } } })).toBe(
      3,
    );
    expect(extractCreditsUsed({ metadata: { creditsUsed: 4 } })).toBe(4);
    expect(extractCreditsUsed({ creditsUsed: 5 })).toBe(5);
    expect(
      extractCreditsUsed({
        data: [
          { metadata: { creditsUsed: 1 } },
          { metadata: { creditsUsed: 2 } },
        ],
      }),
    ).toBe(3);

    expect(
      normalizeWarnings({ warnings: [{ code: "X", message: "x" } as any] }),
    ).toEqual([{ code: "X", message: "x", details: undefined }]);
    expect(normalizeWarnings({ warning: "legacy warning" })).toEqual([
      { code: "LEGACY_WARNING", message: "legacy warning" },
    ]);

    const pending = createPendingEntry({
      id: "pending-1",
      feature: "scrape",
      method: "POST",
      endpoint: "/v2/scrape",
      requestBody: { url: "https://example.com" },
      target: "example.com",
      startedAt: 10,
    });
    const entries = insertPendingEntry([], pending);
    const completed = finalizeHistoryEntry(entries, "pending-1", {
      status: 200,
      body: { success: true },
      completedAt: 50,
      durationMs: 40,
    });

    expect(completed[0].pending).toBe(false);
    expect(restoreRequestBody(completed[0])).toEqual({
      url: "https://example.com",
    });
    expect(
      setHistoryEntryUiState(completed, "pending-1", { open: true })[0].ui.open,
    ).toBe(true);
    expect(removeHistoryEntry(completed, "pending-1")).toHaveLength(0);
    expect(clearCompletedHistory([pending, completed[0]])).toHaveLength(1);
  });
});
