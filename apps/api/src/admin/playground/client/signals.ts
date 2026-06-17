import { signal } from "@preact/signals";

// ---- Phase 2 signals (from PR2) ----
export const apiKey = signal<string>("");
export const activeFeature = signal<string>("scrape");
export const requestBody = signal<Record<string, unknown>>({});
export const response = signal<unknown | null>(null);
export const inflight = signal<boolean>(false);

// ---- Phase 3 signals (from PR3) ----
export const sessionId = signal<string | null>(null);
export const interactive = signal<boolean>(false);
export const recording = signal<boolean>(false);
export const actions = signal<FirecrawlAction[]>([]);
export const recordingUrl = signal<string | null>(null);

// Canonical Firecrawl action types (vocabulary: click/write/press/scroll/wait)
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
