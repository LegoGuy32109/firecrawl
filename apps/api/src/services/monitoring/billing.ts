import { includesFormat } from "../../lib/format-utils";
import type { MonitorTarget } from "./types";

type MonitorCreditPage = {
  target_id: string;
  status: string;
  metadata?: unknown | null;
};

export function getMonitorTargetPerPageCredits(target: MonitorTarget): number {
  const formats = Array.isArray(target.scrapeOptions?.formats)
    ? (target.scrapeOptions!.formats as any[])
    : [];
  if (includesFormat(formats, "deterministicJson")) return 7;
  const hasJson =
    includesFormat(formats, "json") ||
    formats.some(
      format =>
        format?.type === "changeTracking" &&
        Array.isArray(format?.modes) &&
        format.modes.includes("json"),
    );
  return hasJson ? 5 : 1;
}

function getRecordedCreditsUsed(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") return null;

  const creditsUsed = (metadata as { creditsUsed?: unknown }).creditsUsed;
  if (
    typeof creditsUsed !== "number" ||
    !Number.isFinite(creditsUsed) ||
    creditsUsed < 0
  ) {
    return null;
  }

  return Math.ceil(creditsUsed);
}

export function calculateMonitorCheckActualCredits(params: {
  targets: MonitorTarget[];
  pages: MonitorCreditPage[];
}): { actualCredits: number; unknownTargetIds: string[] } {
  const targetsById = new Map(
    params.targets.map(target => [target.id, target] as const),
  );
  const unknownTargetIds = new Set<string>();
  let actualCredits = 0;

  for (const page of params.pages) {
    if (page.status === "removed") {
      // Removed pages are synthetic reconciliation rows copied from prior
      // monitor_pages state. They do not represent a current scrape.
      continue;
    }

    const recordedCredits = getRecordedCreditsUsed(page.metadata);
    if (recordedCredits !== null) {
      actualCredits += recordedCredits;
      continue;
    }

    if (page.status === "error") {
      continue;
    }

    const target = targetsById.get(page.target_id);
    if (!target) {
      unknownTargetIds.add(page.target_id);
      continue;
    }

    actualCredits += getMonitorTargetPerPageCredits(target);
  }

  return {
    actualCredits,
    unknownTargetIds: Array.from(unknownTargetIds),
  };
}
