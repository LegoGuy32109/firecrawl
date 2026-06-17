import { h } from "preact";

type DiagnosticStep = {
  name: string;
  status: string;
  code?: string;
  durationMs?: number;
  startedAt?: string;
};

type Props = {
  steps: DiagnosticStep[];
};

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--get)",
  warning: "var(--post)",
  failed: "#8b1a1a",
  skipped: "var(--muted)",
  timed_out: "#8b1a1a",
};

export function DiagnosticsWaterfall({ steps }: Props) {
  if (!steps.length) return null;

  return (
    <div style={{ marginTop: "12px" }}>
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
        Diagnostics
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "7px 10px",
              background: "var(--panel-strong)",
              border: "1px solid var(--line)",
              fontSize: "12px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: STATUS_COLOR[step.status] ?? "var(--muted)",
                flexShrink: 0,
              }}
            />
            <span style={{ flex: 1, color: "var(--ink)" }}>{step.name}</span>
            <span
              style={{
                color: STATUS_COLOR[step.status] ?? "var(--muted)",
                fontWeight: 700,
              }}
            >
              {step.status}
            </span>
            {step.code && (
              <span style={{ color: "var(--muted)" }}>{step.code}</span>
            )}
            {step.durationMs != null && (
              <span style={{ color: "var(--muted)" }}>{step.durationMs}ms</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
