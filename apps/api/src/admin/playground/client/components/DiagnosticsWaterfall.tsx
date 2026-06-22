import { h } from "preact";

export type DiagnosticStep = {
  name: string;
  status: string;
  code?: string;
  message?: string;
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

function isDiagnosticStep(value: unknown): value is DiagnosticStep {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).name === "string" &&
    typeof (value as Record<string, unknown>).status === "string"
  );
}

function diagnosticArray(value: unknown): DiagnosticStep[] {
  return Array.isArray(value) ? value.filter(isDiagnosticStep) : [];
}

function diagnosticSourceValues(value: unknown): DiagnosticStep[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value as Record<string, unknown>).filter(
    isDiagnosticStep,
  );
}

export function collectDiagnosticSteps(diagnostics: unknown): DiagnosticStep[] {
  if (!diagnostics || typeof diagnostics !== "object") return [];
  const d = diagnostics as Record<string, unknown>;
  const actions = diagnosticArray(d.actions);

  if (actions.length > 0) {
    return actions;
  }

  return [...diagnosticSourceValues(d.sources), ...diagnosticArray(d.steps)];
}

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
            <span style={{ flex: 1, color: "var(--ink)" }}>
              {step.name}
              {step.message && (
                <span className="playground-muted"> · {step.message}</span>
              )}
            </span>
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
