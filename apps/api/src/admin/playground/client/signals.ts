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

export const apiKey = signal<string>("");
export const activeFeature = signal<Feature>("scrape");
export const requestBody = signal<Record<string, unknown>>({});
export const response = signal<EnvelopeView | null>(null);
export const inflight = signal<boolean>(false);
