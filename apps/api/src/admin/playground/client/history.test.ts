import {
  applyPersistenceBudget,
  clearCompletedHistory,
  createPendingEntry,
  deriveTarget,
  extractCreditsUsed,
  finalizeHistoryEntry,
  getDefaultState,
  insertPendingEntry,
  loadPersistedHistory,
  normalizeHistory,
  normalizeWarnings,
  removeHistoryEntry,
  restoreRequestBody,
  savePersistedHistory,
  serializePersistedHistory,
  setHistoryEntryUiState,
  type PlaygroundHistoryEntry,
  type PersistedWorkspaceState,
  type StorageAdapter,
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
    persisted: true,
    ui: {
      open: false,
      panel: "response",
      responseTab: "response",
    },
    ...overrides,
  };
}

function storage(value: string | null): StorageAdapter {
  return {
    getItem: () => value,
    setItem: () => {},
    removeItem: () => {},
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

  it("persists only completed entries within budget and discards pending storage records", () => {
    const first = completedEntry({
      id: "entry-a",
      requestBody: { url: "https://example.com/a" },
      target: "example.com/a",
      body: { success: true, data: { metadata: { creditsUsed: 2 } } },
      creditsUsed: 2,
    });
    const second = completedEntry({
      id: "entry-b",
      requestBody: { url: "https://example.com/b" },
      target: "example.com/b",
      body: { success: true, data: { metadata: { creditsUsed: 3 } } },
      creditsUsed: 3,
    });
    const pending = createPendingEntry({
      id: "entry-c",
      feature: "scrape",
      method: "POST",
      endpoint: "/v2/scrape",
      requestBody: { url: "https://example.com/c" },
      target: "example.com/c",
      startedAt: 3000,
    });

    const state: PersistedWorkspaceState = {
      ...getDefaultState(),
      activeView: "history",
      activeFeature: "scrape",
      entries: [first, second, pending],
    };

    const budget = serializePersistedHistory({
      ...state,
      entries: [first],
    }).length;
    const saved = applyPersistenceBudget(state, budget);
    expect(saved.persistedEntryIds).toEqual(["entry-a"]);
    expect(saved.overflowEntryIds).toEqual(["entry-b"]);
    expect(
      saved.state.entries.find(entry => entry.id === "entry-a")?.persisted,
    ).toBe(true);
    expect(
      saved.state.entries.find(entry => entry.id === "entry-b")?.persisted,
    ).toBe(false);
    expect(
      saved.state.entries.find(entry => entry.id === "entry-c")?.persisted,
    ).toBe(false);
    expect(
      JSON.parse(serializePersistedHistory(saved.state)).entries,
    ).toHaveLength(1);

    const persisted = loadPersistedHistory(
      storage(
        JSON.stringify({
          ...state,
          entries: [first, pending],
        }),
      ),
    );
    expect(persisted.entries).toHaveLength(1);
    expect(persisted.entries[0].id).toBe("entry-a");

    const invalid = loadPersistedHistory(storage("{not-json"));
    expect(invalid).toEqual(getDefaultState());
  });

  it("marks entries not saved when storage write fails", () => {
    const state: PersistedWorkspaceState = {
      ...getDefaultState(),
      entries: [completedEntry({ id: "entry-quota" })],
    };
    const adapter: StorageAdapter = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    };

    const next = savePersistedHistory(adapter, state);
    expect(next.state.entries[0].persisted).toBe(false);
    expect(
      JSON.parse(serializePersistedHistory(next.state)).entries,
    ).toHaveLength(0);
  });
});
