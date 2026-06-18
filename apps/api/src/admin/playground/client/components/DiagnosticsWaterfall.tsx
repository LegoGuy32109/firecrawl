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
    <div className="playground-diagnostics">
      <div className="playground-panel__label">Diagnostics</div>
      <div className="playground-stack">
        {steps.map((step, i) => (
          <div key={i} className="playground-diagnostics__row">
            <span
              className="playground-diagnostics__dot"
              style={{
                background: STATUS_COLOR[step.status] ?? "var(--muted)",
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
            {step.code && <span className="playground-muted">{step.code}</span>}
            {step.durationMs != null && (
              <span className="playground-muted">{step.durationMs}ms</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
