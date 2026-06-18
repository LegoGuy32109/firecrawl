import { INTERACT_LANGUAGES } from "./interact-types";

export type InteractRequestDraft = {
  jobId?: unknown;
  code?: unknown;
  prompt?: unknown;
  language?: unknown;
  timeout?: unknown;
};

export function getInteractRequestValidationError(
  draft: InteractRequestDraft,
  rawMode: boolean,
  rawJson: string,
): string | null {
  if (rawMode) {
    try {
      const parsed = JSON.parse(rawJson) as InteractRequestDraft;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return "Interact request must be a JSON object.";
      }
      return getInteractRequestValidationError(parsed, false, rawJson);
    } catch {
      return "Fix the raw JSON before sending interact.";
    }
  }

  const jobId = typeof draft.jobId === "string" ? draft.jobId.trim() : "";
  if (!jobId) return "Job ID is required.";

  const code = typeof draft.code === "string" ? draft.code.trim() : "";
  const prompt = typeof draft.prompt === "string" ? draft.prompt.trim() : "";
  if (!code && !prompt) return "Provide either code or a prompt.";

  return null;
}

export function buildInteractRequestBody(
  draft: InteractRequestDraft,
  rawMode: boolean,
  rawJson: string,
): Record<string, unknown> | null {
  if (rawMode) {
    try {
      const parsed = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const jobId = typeof draft.jobId === "string" ? draft.jobId.trim() : "";
  const code = typeof draft.code === "string" ? draft.code : "";
  const prompt = typeof draft.prompt === "string" ? draft.prompt : "";
  const language =
    typeof draft.language === "string" &&
    (INTERACT_LANGUAGES as readonly string[]).includes(draft.language)
      ? draft.language
      : "node";
  const timeout =
    typeof draft.timeout === "number" && draft.timeout > 0 ? draft.timeout : 30;

  if (!jobId || (!code.trim() && !prompt.trim())) {
    return null;
  }

  return {
    jobId,
    ...(code.trim() ? { code } : {}),
    ...(prompt.trim() ? { prompt } : {}),
    language,
    timeout,
  };
}
