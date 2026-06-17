import { h } from "preact";
import {
  explainWarning,
  parseWarningCode,
} from "../../../../lib/error-catalog";

type Warning = {
  code: string;
  message: string;
  details?: unknown;
};

type Props = {
  warnings?: Warning[];
  legacyWarning?: string;
};

export function WarningList({ warnings, legacyWarning }: Props) {
  if (!warnings?.length && !legacyWarning) return null;

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
        Warnings
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {warnings?.map((w, i) => {
          const parsedCode = parseWarningCode(w.code);
          const catalog = parsedCode ? explainWarning(parsedCode) : null;
          return (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                background: "var(--accent-soft)",
                border: "1px solid #573121",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "4px",
                }}
              >
                <code style={{ color: "#ffb196", fontSize: "12px" }}>
                  {w.code}
                </code>
              </div>
              <div
                style={{
                  color: "var(--ink)",
                  fontSize: "13px",
                  marginBottom: "4px",
                }}
              >
                {w.message}
              </div>
              {catalog && (
                <div style={{ color: "var(--muted)", fontSize: "12px" }}>
                  <span>{catalog.explanation}</span>
                  {" · "}
                  <span style={{ fontStyle: "italic" }}>
                    Fix: {catalog.fix}
                  </span>
                </div>
              )}
              {w.details && (
                <pre
                  style={{
                    margin: "8px 0 0",
                    padding: "8px",
                    background: "var(--field)",
                    color: "var(--ink)",
                    fontSize: "11px",
                    overflow: "auto",
                    maxHeight: "100px",
                  }}
                >
                  {JSON.stringify(w.details, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
        {!warnings?.length && legacyWarning && (
          <div
            style={{
              padding: "10px 12px",
              background: "var(--accent-soft)",
              border: "1px solid #573121",
              color: "#ffb196",
              fontSize: "13px",
            }}
          >
            {legacyWarning}
          </div>
        )}
      </div>
    </div>
  );
}
