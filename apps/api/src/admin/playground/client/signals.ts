import { effect, signal } from "@preact/signals";
import {
  getDefaultState,
  loadPersistedHistory,
  savePersistedHistory,
  HISTORY_STORAGE_KEY,
  type DockMode,
  type PersistedWorkspaceState,
  type PlaygroundHistoryEntry,
  type PlaygroundView,
} from "./history";

export type Feature =
  | "scrape"
  | "search"
  | "crawl"
  | "map"
  | "extract"
  | "agent";

export type EnvelopeView = {
  status: number;
  body: Record<string, unknown>;
};

export type FirecrawlActionType =
  | "click"
  | "write"
  | "press"
  | "scroll"
  | "wait";

export interface FirecrawlAction {
  type: FirecrawlActionType;
  selector?: string;
  text?: string;
  key?: string;
  direction?: "up" | "down";
  amount?: number;
  milliseconds?: number;
}

export type ActiveView = PlaygroundView;

export const apiKey = signal<string>("");
export const activeFeature = signal<Feature>("scrape");
export const activeView = signal<ActiveView>("scrape");
export const requestBody = signal<Record<string, unknown>>({});
export const requestDrafts = signal<PersistedWorkspaceState["drafts"]>(
  getDefaultState().drafts,
);
export const historyEntries = signal<PlaygroundHistoryEntry[]>([]);
export const requestDockMode = signal<DockMode>("left");
export const lastVisibleDockMode = signal<Exclude<DockMode, "hide">>("left");
export const requestRailWidth = signal<number>(420);
export const inflight = signal<boolean>(false);
export const sessionId = signal<string | null>(null);
export const interactive = signal<boolean>(false);
export const recording = signal<boolean>(false);
export const actions = signal<FirecrawlAction[]>([]);
export const recordingUrl = signal<string | null>(null);

const hasWindow = typeof window !== "undefined";
const storage = hasWindow ? window.localStorage : null;
const defaultApiKey = hasWindow
  ? (document.getElementById("root")?.dataset.defaultApiKey ??
    "fc-3d478a296e59403e85c794aba81ffd2a")
  : "";
let hydratedFeature: Feature | null = null;

if (defaultApiKey) {
  apiKey.value = defaultApiKey;
}

if (storage) {
  const persisted = loadPersistedHistory(storage);
  activeView.value = persisted.activeView;
  activeFeature.value = persisted.activeFeature;
  requestDockMode.value = persisted.requestDockMode;
  lastVisibleDockMode.value = persisted.lastVisibleDockMode;
  requestRailWidth.value = persisted.requestRailWidth;
  requestDrafts.value = persisted.drafts;
  historyEntries.value = persisted.entries;
  requestBody.value = persisted.drafts[persisted.activeFeature] ?? {};
}

effect(() => {
  const active = activeFeature.value;
  const drafts = requestDrafts.value;
  const nextDraft = drafts[active] ?? {};
  if (hydratedFeature !== active) {
    requestBody.value = nextDraft;
    hydratedFeature = active;
  }
});

effect(() => {
  const active = activeFeature.value;
  const current = requestBody.value;
  const drafts = requestDrafts.value;
  if (JSON.stringify(drafts[active] ?? {}) === JSON.stringify(current)) return;
  requestDrafts.value = { ...drafts, [active]: current };
});

if (storage) {
  let persistTimer: number | null = null;
  effect(() => {
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      const state = {
        version: 1 as const,
        activeView: activeView.value,
        activeFeature: activeFeature.value,
        requestDockMode: requestDockMode.value,
        lastVisibleDockMode: lastVisibleDockMode.value,
        requestRailWidth: requestRailWidth.value,
        drafts: requestDrafts.value,
        entries: historyEntries.value,
      };
      try {
        const next = savePersistedHistory(storage, state);
        if (
          JSON.stringify(
            historyEntries.value.map(entry => ({
              id: entry.id,
              persisted: entry.persisted,
            })),
          ) !==
          JSON.stringify(
            next.state.entries.map(entry => ({
              id: entry.id,
              persisted: entry.persisted,
            })),
          )
        ) {
          historyEntries.value = next.state.entries;
        }
      } catch {
        // persistence is best-effort
      }
    }, 150);
  });
}
