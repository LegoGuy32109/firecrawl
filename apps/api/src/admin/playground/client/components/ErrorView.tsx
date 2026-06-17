import { h } from "preact";
import { explainError, parseErrorCode } from "../../../../lib/error-catalog";
import { DiagnosticsWaterfall } from "./DiagnosticsWaterfall";

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
      <div style={{ color: "var(--ink)", fontSize: "13px" }}>
        Needs <strong>{String(d.required)}</strong> credits, have{" "}
        <strong>{String(d.balance)}</strong> (short {String(d.shortfall)})
      </div>
    );
  }

  if (code === "RATE_LIMIT_EXCEEDED") {
    return (
      <div style={{ color: "var(--ink)", fontSize: "13px" }}>
        Limit: {String(d.limit)} · Remaining: {String(d.remaining)} · Resets:{" "}
        {String(d.reset_at)}
        {d.scope && <span> · Scope: {String(d.scope)}</span>}
      </div>
    );
  }

  if (code === "FEATURE_UNSUPPORTED_LOCALLY") {
    return (
      <div style={{ color: "var(--ink)", fontSize: "13px" }}>
        Feature <strong>{String(d.feature)}</strong> requires engine:{" "}
        <strong>{String(d.requiresEngine)}</strong>
      </div>
    );
  }

  return (
    <pre
      style={{
        margin: 0,
        padding: "8px",
        background: "var(--field)",
        color: "var(--ink)",
        fontSize: "11px",
        overflow: "auto",
        maxHeight: "150px",
      }}
    >
      {JSON.stringify(details, null, 2)}
    </pre>
  );
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
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {code && (
        <div
          style={{
            padding: "12px",
            background: "var(--field)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              color: "var(--muted)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Error Code
          </div>
          <code
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
                style={{
                  color: "var(--ink)",
                  fontSize: "13px",
                  marginBottom: "4px",
                }}
              >
                {catalog.explanation}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "12px" }}>
                Fix: <span style={{ fontStyle: "italic" }}>{catalog.fix}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div
          style={{
            padding: "12px",
            background: "var(--field)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              color: "var(--muted)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Message
          </div>
          <div style={{ color: "var(--ink)", fontSize: "13px" }}>
            {errorMsg}
          </div>
        </div>
      )}

      {errorId && (
        <div
          style={{
            padding: "12px",
            background: "var(--field)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "6px",
            }}
          >
            <div
              style={{
                color: "var(--muted)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Error ID
            </div>
            <button
              onClick={copyErrorId}
              style={{
                padding: "2px 8px",
                background: "transparent",
                color: "var(--muted)",
                border: "1px solid var(--line)",
                cursor: "pointer",
                font: "11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
              }}
            >
              Copy
            </button>
          </div>
          <code
            style={{
              color: "var(--ink)",
              fontSize: "12px",
              wordBreak: "break-all",
            }}
          >
            {errorId}
          </code>
        </div>
      )}

      {details && code && (
        <div
          style={{
            padding: "12px",
            background: "var(--field)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              color: "var(--muted)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Details
          </div>
          {renderDetails(code, details)}
        </div>
      )}

      <DiagnosticsWaterfall steps={steps} />
    </div>
  );
}
