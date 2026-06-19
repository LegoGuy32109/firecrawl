import { h } from "preact";
import { useState } from "preact/hooks";
import { JsonEditor } from "../JsonEditor";

type Props = {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  label?: string;
};

const TEMPLATES: Array<{ label: string; value: Record<string, unknown> }> = [
  {
    label: "Simple object",
    value: {
      type: "object",
      properties: {
        field1: { type: "string", description: "Description" },
      },
    },
  },
  {
    label: "List extraction",
    value: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
  {
    label: "Named fields",
    value: {
      type: "object",
      properties: {
        title: { type: "string" },
        price: { type: "number" },
        available: { type: "boolean" },
      },
    },
  },
];

const fieldStyle = {
  width: "100%",
  padding: "10px 11px",
  background: "var(--field)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  font: "12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  resize: "vertical" as const,
};

const labelStyle = {
  color: "var(--muted)",
  fontSize: "11px",
  fontWeight: 700 as const,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

export function SchemaEditor({ value, onChange, label = "Schema" }: Props) {
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState(() => JSON.stringify(value, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);

  const switchToRaw = () => {
    setRawText(JSON.stringify(value, null, 2));
    setParseError(null);
    setRawMode(true);
  };

  const switchToTree = () => {
    try {
      const parsed = JSON.parse(rawText);
      onChange(parsed);
      setParseError(null);
      setRawMode(false);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  const handleRawInput = (text: string) => {
    setRawText(text);
    try {
      const parsed = JSON.parse(text);
      onChange(parsed);
      setParseError(null);
    } catch {
      setParseError("Invalid JSON");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={labelStyle}>{label}</span>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <select
            onChange={e => {
              const t = TEMPLATES.find(
                tp => tp.label === (e.target as HTMLSelectElement).value,
              );
              if (t) {
                onChange(t.value);
                setRawText(JSON.stringify(t.value, null, 2));
              }
            }}
            style={{
              padding: "3px 6px",
              background: "var(--field)",
              border: "1px solid var(--line)",
              color: "var(--muted)",
              font: "11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
              cursor: "pointer",
            }}
          >
            <option value="">Template…</option>
            {TEMPLATES.map(t => (
              <option key={t.label} value={t.label}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={rawMode ? switchToTree : switchToRaw}
            style={{
              padding: "3px 8px",
              background: "transparent",
              color: "var(--muted)",
              border: "1px solid var(--line)",
              cursor: "pointer",
              font: "11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
            }}
          >
            {rawMode ? "Tree" : "Raw"}
          </button>
        </div>
      </div>

      {rawMode ? (
        <div>
          <textarea
            value={rawText}
            onInput={e =>
              handleRawInput((e.target as HTMLTextAreaElement).value)
            }
            rows={6}
            style={fieldStyle}
          />
          {parseError && (
            <div
              style={{ color: "#ffb196", fontSize: "11px", marginTop: "4px" }}
            >
              {parseError}
            </div>
          )}
        </div>
      ) : (
        <JsonEditor value={value} onChange={onChange} />
      )}
    </div>
  );
}
