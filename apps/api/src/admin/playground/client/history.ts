import type { Feature } from "./signals";
import type { FirecrawlAction } from "./signals";

export const HISTORY_STORAGE_KEY = "firecrawl.playground.responseHistory.v1";
export const HISTORY_BUDGET_BYTES = 4 * 1024 * 1024;

export type PlaygroundView = Feature | "history";
export type DockMode = "left" | "right" | "hide";
export type ResponsePanel = "request" | "response";

export type PlaygroundWarning = {
  code: string;
  message: string;
  details?: unknown;
};

export type PlaygroundHistoryEntry = {
  id: string;
  feature: Feature;
  method: string;
  endpoint: string;
  requestBody: Record<string, unknown>;
  target: string;
  status: number | null;
  body?: Record<string, unknown>;
  errorMessage?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  creditsUsed?: number;
  warningCount: number;
  warnings?: PlaygroundWarning[];
  legacyWarning?: string;
  code?: string;
  pending: boolean;
  persisted: boolean;
  ui: {
    open: boolean;
    panel: ResponsePanel;
    responseTab?: string;
  };
};

export type PersistedWorkspaceState = {
  version: 1;
  activeView: PlaygroundView;
  activeFeature: Feature;
  requestDockMode: DockMode;
  lastVisibleDockMode: Exclude<DockMode, "hide">;
  requestRailWidth: number;
  drafts: Record<Feature, Record<string, unknown>>;
  entries: PlaygroundHistoryEntry[];
};

export type StorageAdapter = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

const FEATURES: Feature[] = [
  "scrape",
  "search",
  "crawl",
  "map",
  "extract",
  "agent",
];

const DEFAULT_DRAFTS = Object.fromEntries(
  FEATURES.map(feature => [feature, {}]),
) as Record<Feature, Record<string, unknown>>;

const DEFAULT_STATE: PersistedWorkspaceState = {
  version: 1,
  activeView: "scrape",
  activeFeature: "scrape",
  requestDockMode: "left",
  lastVisibleDockMode: "left",
  requestRailWidth: 420,
  drafts: DEFAULT_DRAFTS,
  entries: [],
};

function isFeature(value: unknown): value is Feature {
  return (
    value === "scrape" ||
    value === "search" ||
    value === "crawl" ||
    value === "map" ||
    value === "extract" ||
    value === "agent"
  );
}

function isDockMode(value: unknown): value is DockMode {
  return value === "left" || value === "right" || value === "hide";
}

function isPanel(value: unknown): value is ResponsePanel {
  return value === "request" || value === "response";
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function normalizeBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeWarning(value: unknown): PlaygroundWarning | null {
  if (!value || typeof value !== "object") return null;
  const warning = value as Record<string, unknown>;
  const code = typeof warning.code === "string" ? warning.code : null;
  const message = typeof warning.message === "string" ? warning.message : null;
  if (!code || !message) return null;

  return {
    code,
    message,
    details: warning.details,
  };
}

export function normalizeWarnings(
  body: Record<string, unknown>,
): PlaygroundWarning[] {
  const warnings = Array.isArray(body.warnings)
    ? body.warnings.map(normalizeWarning).filter(Boolean)
    : [];
  if (warnings.length) return warnings as PlaygroundWarning[];

  const legacyWarning =
    typeof body.warning === "string" ? body.warning.trim() : "";
  if (!legacyWarning) return [];

  return [
    {
      code: "LEGACY_WARNING",
      message: legacyWarning,
    },
  ];
}

export function extractCreditsUsed(
  body: Record<string, unknown>,
): number | null {
  const metadata = body.metadata;
  if (
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    typeof (metadata as Record<string, unknown>).creditsUsed === "number"
  ) {
    return (metadata as Record<string, unknown>).creditsUsed as number;
  }

  const data = body.data;
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    typeof (data as Record<string, unknown>).metadata === "object"
  ) {
    const nestedMetadata = (data as Record<string, unknown>).metadata as Record<
      string,
      unknown
    >;
    if (typeof nestedMetadata.creditsUsed === "number") {
      return nestedMetadata.creditsUsed;
    }
  }

  if (typeof body.creditsUsed === "number") {
    return body.creditsUsed;
  }

  if (Array.isArray(data)) {
    let total = 0;
    let count = 0;
    for (const item of data) {
      if (
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof (item as Record<string, unknown>).metadata === "object"
      ) {
        const nestedMetadata = (item as Record<string, unknown>)
          .metadata as Record<string, unknown>;
        if (typeof nestedMetadata.creditsUsed === "number") {
          total += nestedMetadata.creditsUsed;
          count++;
        }
      }
    }
    return count > 0 ? total : null;
  }

  return null;
}

function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

export function deriveTarget(
  feature: Feature,
  requestBody: Record<string, unknown>,
  endpoint: string,
): string {
  if (feature === "scrape" || feature === "crawl" || feature === "map") {
    const url = requestBody.url;
    if (typeof url === "string" && url.trim()) return stripProtocol(url.trim());
  }

  if (feature === "search") {
    const query = requestBody.query;
    if (typeof query === "string" && query.trim()) return query.trim();
  }

  if (feature === "extract") {
    const urls = Array.isArray(requestBody.urls)
      ? requestBody.urls.filter(
          (item): item is string => typeof item === "string",
        )
      : [];
    if (urls.length > 0) {
      const first = stripProtocol(urls[0].trim());
      return urls.length > 1 ? `${first} +${urls.length - 1}` : first;
    }
  }

  if (feature === "agent") {
    const startUrl = requestBody.startUrl;
    if (typeof startUrl === "string" && startUrl.trim()) {
      return stripProtocol(startUrl.trim());
    }

    const agentPrompt = requestBody.agentPrompt;
    if (typeof agentPrompt === "string" && agentPrompt.trim()) {
      const trimmed = agentPrompt.trim();
      return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
    }
  }

  return endpoint;
}

function getActiveTab(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "response";
}

function normalizeEntry(value: unknown): PlaygroundHistoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const id = typeof entry.id === "string" && entry.id ? entry.id : null;
  const feature = isFeature(entry.feature) ? entry.feature : null;
  const method =
    typeof entry.method === "string" && entry.method ? entry.method : null;
  const endpoint =
    typeof entry.endpoint === "string" && entry.endpoint
      ? entry.endpoint
      : null;
  const requestBody = normalizeBody(entry.requestBody);
  const target = typeof entry.target === "string" ? entry.target : endpoint;
  if (!id || !feature || !method || !endpoint) return null;

  const status = typeof entry.status === "number" ? entry.status : null;
  const warnings = Array.isArray(entry.warnings)
    ? entry.warnings.map(normalizeWarning).filter(Boolean)
    : undefined;
  const legacyWarning =
    typeof entry.legacyWarning === "string" ? entry.legacyWarning : undefined;
  const persisted = entry.persisted !== false;

  return {
    id,
    feature,
    method,
    endpoint,
    requestBody,
    target,
    status,
    body: normalizeBody(entry.body),
    errorMessage:
      typeof entry.errorMessage === "string" ? entry.errorMessage : undefined,
    startedAt:
      typeof entry.startedAt === "number" ? entry.startedAt : Date.now(),
    completedAt:
      typeof entry.completedAt === "number" ? entry.completedAt : undefined,
    durationMs:
      typeof entry.durationMs === "number" ? entry.durationMs : undefined,
    creditsUsed:
      typeof entry.creditsUsed === "number" ? entry.creditsUsed : undefined,
    warningCount:
      typeof entry.warningCount === "number"
        ? entry.warningCount
        : (warnings?.length ?? (legacyWarning ? 1 : 0)),
    warnings,
    legacyWarning,
    code: typeof entry.code === "string" ? entry.code : undefined,
    pending: !!entry.pending,
    persisted,
    ui: {
      open:
        !!entry.ui && typeof entry.ui === "object"
          ? !!(entry.ui as Record<string, unknown>).open
          : false,
      panel:
        !!entry.ui && typeof entry.ui === "object"
          ? isPanel((entry.ui as Record<string, unknown>).panel)
            ? ((entry.ui as Record<string, unknown>).panel as ResponsePanel)
            : "response"
          : "response",
      responseTab:
        !!entry.ui && typeof entry.ui === "object"
          ? getActiveTab((entry.ui as Record<string, unknown>).responseTab)
          : "response",
    },
  };
}

function normalizeDrafts(
  value: unknown,
): Record<Feature, Record<string, unknown>> {
  const drafts = { ...DEFAULT_DRAFTS };
  if (!value || typeof value !== "object") return drafts;

  for (const feature of FEATURES) {
    const draft = (value as Record<string, unknown>)[feature];
    if (draft && typeof draft === "object" && !Array.isArray(draft)) {
      drafts[feature] = draft as Record<string, unknown>;
    }
  }

  return drafts;
}

export function normalizeHistory(value: unknown): PersistedWorkspaceState {
  if (!value || typeof value !== "object") return { ...DEFAULT_STATE };

  const state = value as Record<string, unknown>;
  const entries = Array.isArray(state.entries)
    ? state.entries.map(normalizeEntry).filter(Boolean)
    : [];

  return {
    version: 1,
    activeView:
      isFeature(state.activeView) || state.activeView === "history"
        ? (state.activeView as PlaygroundView)
        : "scrape",
    activeFeature: isFeature(state.activeFeature)
      ? state.activeFeature
      : "scrape",
    requestDockMode: isDockMode(state.requestDockMode)
      ? state.requestDockMode
      : "left",
    lastVisibleDockMode:
      state.lastVisibleDockMode === "right" ? "right" : "left",
    requestRailWidth:
      typeof state.requestRailWidth === "number" &&
      state.requestRailWidth >= 320 &&
      state.requestRailWidth <= 680
        ? state.requestRailWidth
        : 420,
    drafts: normalizeDrafts(state.drafts),
    entries: entries as PlaygroundHistoryEntry[],
  };
}

export function serializePersistedHistory(
  state: PersistedWorkspaceState,
): string {
  const persistedEntries = state.entries.filter(
    entry => entry.persisted !== false && !entry.pending,
  );
  return JSON.stringify({
    version: 1,
    activeView: state.activeView,
    activeFeature: state.activeFeature,
    requestDockMode: state.requestDockMode,
    lastVisibleDockMode: state.lastVisibleDockMode,
    requestRailWidth: state.requestRailWidth,
    drafts: state.drafts,
    entries: persistedEntries,
  });
}

export type BudgetResult = {
  state: PersistedWorkspaceState;
  persistedEntryIds: string[];
  overflowEntryIds: string[];
  serializedBytes: number;
};

export function applyPersistenceBudget(
  state: PersistedWorkspaceState,
  budget = HISTORY_BUDGET_BYTES,
): BudgetResult {
  const next = normalizeHistory(state);
  const baseEntries = next.entries.filter(entry => !entry.pending);
  const persistedEntryIds: string[] = [];
  const overflowEntryIds: string[] = [];
  const selected: PlaygroundHistoryEntry[] = [];

  for (const entry of baseEntries) {
    const candidate = {
      ...next,
      entries: [...selected, { ...entry, persisted: true }],
    };
    const bytes = byteLength(serializePersistedHistory(candidate));
    if (bytes <= budget) {
      selected.push({ ...entry, persisted: true });
      persistedEntryIds.push(entry.id);
    } else {
      overflowEntryIds.push(entry.id);
    }
  }

  const updatedEntries = next.entries.map(entry => {
    if (entry.pending) return { ...entry, persisted: false };
    return persistedEntryIds.includes(entry.id)
      ? { ...entry, persisted: true }
      : { ...entry, persisted: false };
  });

  const finalState = {
    ...next,
    entries: updatedEntries,
  };

  return {
    state: finalState,
    persistedEntryIds,
    overflowEntryIds,
    serializedBytes: byteLength(serializePersistedHistory(finalState)),
  };
}

export function createPendingEntry(args: {
  id: string;
  feature: Feature;
  method: string;
  endpoint: string;
  requestBody: Record<string, unknown>;
  target: string;
  startedAt: number;
}): PlaygroundHistoryEntry {
  return {
    ...args,
    status: null,
    pending: true,
    persisted: false,
    warningCount: 0,
    ui: {
      open: true,
      panel: "response",
      responseTab: "response",
    },
  };
}

export function insertPendingEntry(
  entries: PlaygroundHistoryEntry[],
  entry: PlaygroundHistoryEntry,
): PlaygroundHistoryEntry[] {
  return [entry, ...entries];
}

export function finalizeHistoryEntry(
  entries: PlaygroundHistoryEntry[],
  id: string,
  patch: Partial<
    Pick<
      PlaygroundHistoryEntry,
      | "status"
      | "body"
      | "errorMessage"
      | "completedAt"
      | "durationMs"
      | "creditsUsed"
      | "warningCount"
      | "warnings"
      | "legacyWarning"
      | "code"
    >
  >,
): PlaygroundHistoryEntry[] {
  return entries.map(entry =>
    entry.id === id ? completeEntry(entry, patch) : entry,
  );
}

export function removeHistoryEntry(
  entries: PlaygroundHistoryEntry[],
  id: string,
): PlaygroundHistoryEntry[] {
  return entries.filter(entry => entry.id !== id);
}

export function clearCompletedHistory(
  entries: PlaygroundHistoryEntry[],
): PlaygroundHistoryEntry[] {
  return entries.filter(entry => entry.pending);
}

export function setHistoryEntryUiState(
  entries: PlaygroundHistoryEntry[],
  id: string,
  patch: Partial<PlaygroundHistoryEntry["ui"]>,
): PlaygroundHistoryEntry[] {
  return entries.map(entry =>
    entry.id === id ? setEntryUi(entry, patch) : entry,
  );
}

export function completeEntry(
  entry: PlaygroundHistoryEntry,
  patch: Partial<
    Pick<
      PlaygroundHistoryEntry,
      | "status"
      | "body"
      | "errorMessage"
      | "completedAt"
      | "durationMs"
      | "creditsUsed"
      | "warningCount"
      | "warnings"
      | "legacyWarning"
      | "code"
    >
  >,
): PlaygroundHistoryEntry {
  const body = patch.body ?? entry.body ?? {};
  const warnings = patch.warnings ?? normalizeWarnings(body);
  const legacyWarning = patch.legacyWarning ?? entry.legacyWarning;
  return {
    ...entry,
    ...patch,
    body,
    warnings,
    legacyWarning,
    warningCount:
      patch.warningCount ?? warnings.length ?? (legacyWarning ? 1 : 0),
    pending: false,
  };
}

export function setEntryUi(
  entry: PlaygroundHistoryEntry,
  patch: Partial<PlaygroundHistoryEntry["ui"]>,
): PlaygroundHistoryEntry {
  return {
    ...entry,
    ui: {
      ...entry.ui,
      ...patch,
    },
  };
}

export function setEntryPersisted(
  entry: PlaygroundHistoryEntry,
  persisted: boolean,
): PlaygroundHistoryEntry {
  return {
    ...entry,
    persisted,
  };
}

export function loadPersistedHistory(
  storage: StorageAdapter,
): PersistedWorkspaceState {
  const raw = storage.getItem(HISTORY_STORAGE_KEY);
  if (!raw) return { ...DEFAULT_STATE };

  try {
    const state = normalizeHistory(JSON.parse(raw));
    return {
      ...state,
      entries: state.entries.filter(entry => !entry.pending),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function savePersistedHistory(
  storage: StorageAdapter,
  state: PersistedWorkspaceState,
): BudgetResult {
  const next = applyPersistenceBudget(state);
  try {
    storage.setItem(HISTORY_STORAGE_KEY, serializePersistedHistory(next.state));
    return next;
  } catch {
    const failedState: PersistedWorkspaceState = {
      ...next.state,
      entries: next.state.entries.map(entry => ({
        ...entry,
        persisted: false,
      })),
    };
    return {
      ...next,
      state: failedState,
      persistedEntryIds: [],
      overflowEntryIds: next.state.entries
        .filter(entry => !entry.pending)
        .map(entry => entry.id),
      serializedBytes: byteLength(serializePersistedHistory(failedState)),
    };
  }
}

export function removePersistedHistory(storage: StorageAdapter): void {
  storage.removeItem(HISTORY_STORAGE_KEY);
}

export function restoreRequestBody(
  entry: PlaygroundHistoryEntry,
): Record<string, unknown> {
  return entry.requestBody;
}

export function makeEntryId(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${random}`;
}

export function getDefaultState(): PersistedWorkspaceState {
  return {
    ...DEFAULT_STATE,
    drafts: { ...DEFAULT_DRAFTS },
    entries: [],
  };
}
