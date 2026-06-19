import { effect, signal } from "@preact/signals";
import {
  getDefaultState,
  type DockMode,
  type PlaygroundWorkspaceState,
  type PlaygroundHistoryEntry,
  type PlaygroundView,
} from "./history";

export type Feature =
  | "scrape"
  | "interact"
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
export const requestDrafts = signal<PlaygroundWorkspaceState["drafts"]>(
  getDefaultState().drafts,
);
export const historyEntries = signal<PlaygroundHistoryEntry[]>([]);
export const requestDockMode = signal<DockMode>("left");
export const lastVisibleDockMode = signal<Exclude<DockMode, "hide">>("left");
export const requestRailWidth = signal<number>(420);
export const inflight = signal<boolean>(false);
export const sessionId = signal<string | null>(null);
export const liveViewUrl = signal<string | null>(null);
export const activeInteractJobId = signal<string | null>(null);
export const interactive = signal<boolean>(false);
export const recording = signal<boolean>(false);
export const actions = signal<FirecrawlAction[]>([]);
export const recordingUrl = signal<string | null>(null);

export function clearLiveSession(): void {
  liveViewUrl.value = null;
  sessionId.value = null;
  activeInteractJobId.value = null;
}

export function openInInteract(scrapeId: string): void {
  const newDraft = { jobId: scrapeId };
  requestDrafts.value = { ...requestDrafts.value, interact: newDraft };
  clearLiveSession();
  // Switch feature before writing requestBody so the draft effect updates
  // drafts.interact, not drafts.scrape.
  activeFeature.value = "interact";
  activeView.value = "interact";
  requestBody.value = newDraft;
}

const hasWindow = typeof window !== "undefined";
const defaultApiKey = hasWindow
  ? (document.getElementById("root")?.dataset.defaultApiKey ??
    "fc-3d478a296e59403e85c794aba81ffd2a")
  : "";
let hydratedFeature: Feature | null = null;

if (defaultApiKey) {
  apiKey.value = defaultApiKey;
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
