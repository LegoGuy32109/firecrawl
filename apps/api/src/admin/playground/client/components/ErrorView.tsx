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

export function ErrorView({ body }: Props) {
  const code = typeof body.code === "string" ? body.code : null;
  const errorMsg = typeof body.error === "string" ? body.error : null;
  const errorId = typeof body.errorId === "string" ? body.errorId : null;
  const details = body.details;
  const diagnostics = body.diagnostics as Record<string, unknown> | undefined;
  const steps = (diagnostics?.steps as DiagnosticStep[] | undefined) ?? [];

  const parsedCode = code ? parseErrorCode(code) : null;
  const catalog = parsedCode ? explainError(parsedCode) : null;

  const copyErrorId = () => {
    if (errorId) navigator.clipboard?.writeText(errorId);
  };

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

      {errorId && (
        <div className="playground-surface">
          <div className="playground-row playground-row--between">
            <div className="playground-surface__label">Error ID</div>
            <Button type="button" onClick={copyErrorId} size="xs">
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
      )}

      {details && code && (
        <div className="playground-surface">
          <div className="playground-surface__label">Details</div>
          {renderDetails(code, details)}
        </div>
      )}

      <DiagnosticsWaterfall steps={steps} />
    </div>
  );
}
