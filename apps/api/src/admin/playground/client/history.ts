import type { Feature } from "./signals";

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
  ui: {
    open: boolean;
    panel: ResponsePanel;
    responseTab?: string;
  };
};

export type PlaygroundWorkspaceState = {
  version: 1;
  activeView: PlaygroundView;
  activeFeature: Feature;
  requestDockMode: DockMode;
  lastVisibleDockMode: Exclude<DockMode, "hide">;
  requestRailWidth: number;
  drafts: Record<Feature, Record<string, unknown>>;
  entries: PlaygroundHistoryEntry[];
};

const FEATURES: Feature[] = [
  "scrape",
  "interact",
  "search",
  "crawl",
  "map",
  "extract",
  "agent",
];

const DEFAULT_DRAFTS = Object.fromEntries(
  FEATURES.map(feature => [feature, {}]),
) as Record<Feature, Record<string, unknown>>;

const DEFAULT_STATE: PlaygroundWorkspaceState = {
  version: 1,
  activeView: "scrape",
  activeFeature: "scrape",
  requestDockMode: "left",
  lastVisibleDockMode: "left",
  requestRailWidth: 420,
  drafts: DEFAULT_DRAFTS,
  entries: [],
};

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

  if (feature === "interact") {
    const jobId = requestBody.jobId;
    if (typeof jobId === "string" && jobId.trim()) {
      return jobId.trim();
    }
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

export function getDefaultState(): PlaygroundWorkspaceState {
  return {
    ...DEFAULT_STATE,
    drafts: { ...DEFAULT_DRAFTS },
    entries: [],
  };
}
