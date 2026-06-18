import { h } from "preact";
import { explainError, parseErrorCode } from "../../../../lib/error-catalog";
import { DiagnosticsWaterfall } from "./DiagnosticsWaterfall";
import { JsonView } from "./JsonView";
import { Button } from "./ui/Button";

type DiagnosticStep = {
  name: string;
  status: string;
  code?: string;
  durationMs?: number;
};

type Props = {
  body: Record<string, unknown>;
};

function CatalogSurface({
  catalog,
}: {
  catalog: { explanation: string; fix: string };
}) {
  return (
    <div className="playground-surface">
      <div className="playground-warning__text" style={{ marginBottom: "4px" }}>
        {catalog.explanation}
      </div>
      <div className="playground-warning__meta">
        Fix: <span>{catalog.fix}</span>
      </div>
    </div>
  );
}

function ErrorIdSurface({
  errorId,
  onCopy,
}: {
  errorId: string;
  onCopy: () => void;
}) {
  return (
    <div className="playground-surface">
      <div className="playground-row playground-row--between">
        <div className="playground-surface__label">Error ID</div>
        <Button type="button" onClick={onCopy} size="xs">
          Copy
        </Button>
      </div>
      <code
        className="playground-code"
        style={{ fontSize: "12px", wordBreak: "break-all" }}
      >
        {errorId}
      </code>
    </div>
  );
}

function renderDetails(code: string, details: unknown) {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;

  if (code === "INSUFFICIENT_CREDITS") {
    return (
      <div className="playground-warning__text">
        Needs <strong>{String(d.required)}</strong> credits, have{" "}
        <strong>{String(d.balance)}</strong> (short {String(d.shortfall)})
      </div>
    );
  }

  if (code === "RATE_LIMIT_EXCEEDED") {
    return (
      <div className="playground-warning__text">
        Limit: {String(d.limit)} · Remaining: {String(d.remaining)} · Resets:{" "}
        {String(d.reset_at)}
        {d.scope && <span> · Scope: {String(d.scope)}</span>}
      </div>
    );
  }

  if (code === "FEATURE_UNSUPPORTED_LOCALLY") {
    return (
      <div className="playground-warning__text">
        Feature <strong>{String(d.feature)}</strong> requires engine:{" "}
        <strong>{String(d.requiresEngine)}</strong>
      </div>
    );
  }

  return <JsonView value={details as object} collapsed={2} />;
}

function failureHeadline(code: string, d: Record<string, unknown>): string {
  if (code === "SCRAPE_ACTION_ERROR") {
    const idx = d.actionIndex != null ? String(d.actionIndex) : "?";
    return d.selector
      ? `Action ${idx} failed: ${String(d.selector)}`
      : `Action ${idx} failed`;
  }
  if (code === "BROWSER_EXECUTION_FAILED") {
    const replay = d.replayFailedAt as
      | Record<string, unknown>
      | null
      | undefined;
    if (replay && replay.actionIndex != null) {
      return `Replay reconstruction failed at action ${String(replay.actionIndex)} (${String(replay.actionType)})`;
    }
    return "Interact code failed";
  }
  return code;
}

export function ErrorView({ body }: Props) {
  const code = typeof body.code === "string" ? body.code : null;
  const errorMsg = typeof body.error === "string" ? body.error : null;
  const errorId = typeof body.errorId === "string" ? body.errorId : null;
  const details = body.details;
  const diagnostics = body.diagnostics as Record<string, unknown> | undefined;
  const actions = diagnostics?.actions as DiagnosticStep[] | undefined;
  const steps = diagnostics?.steps as DiagnosticStep[] | undefined;
  const waterfallSteps = (actions?.length ? actions : steps) ?? [];

  const parsedCode = code ? parseErrorCode(code) : null;
  const catalog = parsedCode ? explainError(parsedCode) : null;

  const copyErrorId = () => {
    if (errorId) navigator.clipboard?.writeText(errorId);
  };

  const d =
    details && typeof details === "object"
      ? (details as Record<string, unknown>)
      : null;

  const useFailureFrame =
    (code === "SCRAPE_ACTION_ERROR" || code === "BROWSER_EXECUTION_FAILED") &&
    d != null &&
    (d.pageUrl != null ||
      d.screenshot != null ||
      d.actionIndex != null ||
      d.stderrSnippet != null ||
      d.replayFailedAt != null ||
      d.exitCode != null);

  if (useFailureFrame && code && d) {
    const screenshot = typeof d.screenshot === "string" ? d.screenshot : null;
    const pageUrl = typeof d.pageUrl === "string" ? d.pageUrl : null;
    const stderrSnippet =
      typeof d.stderrSnippet === "string" ? d.stderrSnippet : null;

    return (
      <div className="playground-stack">
        <div className="playground-failure__headline">
          <code className="playground-chip playground-chip--danger">
            {code}
          </code>
          <span className="playground-failure__headline-text">
            {failureHeadline(code, d)}
          </span>
        </div>

        {screenshot ? (
          <a
            target="_blank"
            rel="noopener noreferrer"
            href={`data:image/jpeg;base64,${screenshot}`}
          >
            <img
              className="playground-failure__screenshot"
              src={`data:image/jpeg;base64,${screenshot}`}
              alt="Page state at failure"
            />
          </a>
        ) : (
          <div className="playground-failure__screenshot-empty">
            screenshot unavailable
          </div>
        )}

        {pageUrl && <div className="playground-failure__url">{pageUrl}</div>}

        {catalog && <CatalogSurface catalog={catalog} />}

        {errorMsg && (
          <div className="playground-surface">
            <div className="playground-surface__label">Message</div>
            <div className="playground-warning__text">{errorMsg}</div>
          </div>
        )}

        {stderrSnippet && (
          <div className="playground-surface">
            <div className="playground-surface__label">Error output</div>
            <pre className="playground-pre">{stderrSnippet}</pre>
          </div>
        )}

        {errorId && <ErrorIdSurface errorId={errorId} onCopy={copyErrorId} />}

        <details>
          <summary
            className="playground-muted"
            style={{ cursor: "pointer", fontSize: "12px" }}
          >
            Raw details
          </summary>
          <JsonView value={details as object} maxStringLength={100} />
        </details>

        <DiagnosticsWaterfall steps={waterfallSteps} />
      </div>
    );
  }

  return (
    <div className="playground-stack">
      {code && (
        <div className="playground-surface">
          <div className="playground-surface__label">Error Code</div>
          <code
            className="playground-code"
            style={{
              color: "var(--accent)",
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            {code}
          </code>
          {catalog && (
            <div style={{ marginTop: "8px" }}>
              <div
                className="playground-warning__text"
                style={{ marginBottom: "4px" }}
              >
                {catalog.explanation}
              </div>
              <div className="playground-warning__meta">
                Fix: <span>{catalog.fix}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="playground-surface">
          <div className="playground-surface__label">Message</div>
          <div className="playground-warning__text">{errorMsg}</div>
        </div>
      )}

      {errorId && <ErrorIdSurface errorId={errorId} onCopy={copyErrorId} />}

      {details && code && (
        <div className="playground-surface">
          <div className="playground-surface__label">Details</div>
          {renderDetails(code, details)}
        </div>
      )}

      <DiagnosticsWaterfall steps={waterfallSteps} />
    </div>
  );
}
