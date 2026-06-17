import { signal } from "@preact/signals";

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

export const apiKey = signal<string>("");
export const activeFeature = signal<Feature>("scrape");
export const requestBody = signal<Record<string, unknown>>({});
export const response = signal<EnvelopeView | null>(null);
export const inflight = signal<boolean>(false);
export const sessionId = signal<string | null>(null);
export const interactive = signal<boolean>(false);
export const recording = signal<boolean>(false);
export const actions = signal<FirecrawlAction[]>([]);
export const recordingUrl = signal<string | null>(null);
