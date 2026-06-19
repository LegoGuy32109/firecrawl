export type InteractResponseContext = {
  sessionId: string | null;
  liveViewUrl: string | null;
};

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? (value as string) : null;
}

export function extractInteractResponseContext(
  data: Record<string, unknown>,
): InteractResponseContext {
  const details =
    data.details &&
    typeof data.details === "object" &&
    !Array.isArray(data.details)
      ? (data.details as Record<string, unknown>)
      : null;
  const sessionId = getString(data.sessionId) ?? getString(details?.sessionId);
  const liveViewUrl =
    getString(data.liveViewUrl) ?? getString(details?.liveViewUrl);

  return {
    sessionId,
    liveViewUrl,
  };
}
