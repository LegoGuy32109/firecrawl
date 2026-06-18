import { h } from "preact";
import { response, inflight, activeFeature } from "../signals";
import { StatusPill } from "./StatusPill";
import { SuccessView } from "./SuccessView";
import { ErrorView } from "./ErrorView";
import { WarningList } from "./WarningList";
import { EmptyState } from "./ui/EmptyState";

export function ResponsePane() {
  if (inflight.value) {
    return <EmptyState>Sending…</EmptyState>;
  }

  if (!response.value) {
    return <EmptyState>Response will appear here</EmptyState>;
  }

  const { status, body } = response.value;
  const isError = !body.success || body.status === "failed" || status >= 400;
  const code = typeof body.code === "string" ? body.code : undefined;
  const warnings = Array.isArray(body.warnings)
    ? (body.warnings as Array<{
        code: string;
        message: string;
        details?: unknown;
      }>)
    : undefined;
  const legacyWarning =
    typeof body.warning === "string" ? body.warning : undefined;

  // SuccessView renders warnings as a banner for scrape; avoid duplicating
  const isScrapeSuccess = activeFeature.value === "scrape" && !isError;

  return (
    <div>
      <StatusPill httpStatus={status} code={code} />
      {isError ? (
        <ErrorView body={body} />
      ) : (
        <SuccessView
          body={body}
          warnings={isScrapeSuccess ? warnings : undefined}
          legacyWarning={isScrapeSuccess ? legacyWarning : undefined}
        />
      )}
      {!isScrapeSuccess && (
        <WarningList warnings={warnings} legacyWarning={legacyWarning} />
      )}
    </div>
  );
}
