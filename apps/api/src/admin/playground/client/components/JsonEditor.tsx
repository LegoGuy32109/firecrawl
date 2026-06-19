import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import { Button } from "./ui/Button";

const ENGINE_UNSUPPORTED = new Set(["proxy", "blockAds"]);

type KnownParam = { key: string; defaultValue: unknown; label: string };

export const SCRAPE_KNOWN_PARAMS: KnownParam[] = [
  { key: "onlyMainContent", defaultValue: true, label: "onlyMainContent" },
  { key: "waitFor", defaultValue: 0, label: "waitFor (ms)" },
  { key: "timeout", defaultValue: 30000, label: "timeout (ms)" },
  { key: "mobile", defaultValue: false, label: "mobile" },
  { key: "fastMode", defaultValue: false, label: "fastMode" },
  {
    key: "skipTlsVerification",
    defaultValue: false,
    label: "skipTlsVerification",
  },
  {
    key: "removeBase64Images",
    defaultValue: true,
    label: "removeBase64Images",
  },
  { key: "headers", defaultValue: {}, label: "headers {}" },
  { key: "location", defaultValue: { country: "US" }, label: "location" },
  { key: "actions", defaultValue: [], label: "actions []" },
  { key: "parsers", defaultValue: [{ type: "pdf" }], label: "parsers []" },
  { key: "maxAge", defaultValue: 0, label: "maxAge (ms)" },
  { key: "minAge", defaultValue: 0, label: "minAge (ms)" },
  { key: "storeInCache", defaultValue: true, label: "storeInCache" },
  { key: "zeroDataRetention", defaultValue: false, label: "zeroDataRetention" },
  { key: "redactPII", defaultValue: false, label: "redactPII" },
];

type Props = {
  value: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
};

export function JsonEditor({ value, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [rawText, setRawText] = useState(() => JSON.stringify(value, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keep rawText in sync when value changes externally (e.g. adding a param)
  useEffect(() => {
    setRawText(JSON.stringify(value, null, 2));
    setParseError(null);
  }, [JSON.stringify(value)]);

  useEffect(() => {
    if (!addOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setAddOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addOpen]);

  const unsupportedKeys = Object.keys(value).filter(k =>
    ENGINE_UNSUPPORTED.has(k),
  );
  const availableParams = SCRAPE_KNOWN_PARAMS.filter(p => !(p.key in value));

  const handleTextChange = (e: Event) => {
    const text = (e.target as HTMLTextAreaElement).value;
    setRawText(text);
    try {
      const parsed = JSON.parse(text);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
      ) {
        setParseError(null);
        onChange(parsed as Record<string, unknown>);
      } else {
        setParseError("Must be a JSON object");
      }
    } catch {
      setParseError("Invalid JSON");
    }
  };

  const addParam = (param: KnownParam) => {
    onChange({ ...value, [param.key]: param.defaultValue });
    setAddOpen(false);
  };

  const addCustom = () => {
    const key = window.prompt("Parameter name:");
    if (key?.trim()) {
      onChange({ ...value, [key.trim()]: "" });
      setAddOpen(false);
    }
  };

  return (
    <div className="playground-stack">
      {unsupportedKeys.length > 0 && (
        <div className="playground-warning">
          <code className="playground-warning__code">
            {unsupportedKeys.join(", ")}
          </code>{" "}
          {unsupportedKeys.length === 1 ? "is" : "are"} not supported by the
          local CDP engine - expect <code>FEATURE_UNSUPPORTED_LOCALLY</code>
        </div>
      )}

      <div style={{ position: "relative" }}>
        <textarea
          value={rawText}
          onInput={handleTextChange}
          className="playground-textarea"
          style={{
            color: parseError ? "#ff6b6b" : "var(--ink)",
            borderColor: parseError ? "#ff6b6b" : "var(--line)",
            maxHeight: "400px",
          }}
          spellCheck={false}
        />
        {parseError && (
          <div style={{ fontSize: "11px", color: "#ff6b6b", marginTop: "2px" }}>
            {parseError}
          </div>
        )}
      </div>

      <div className="playground-row">
        <span
          ref={dropdownRef}
          className="playground-muted"
          style={{ fontSize: "11px" }}
        >
          <Button
            type="button"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              setAddOpen(o => !o);
            }}
            title="Add parameter"
            size="xs"
            variant="ghost"
          >
            + Add param
          </Button>
          {addOpen && (
            <div
              className="playground-panel"
              style={{
                position: "absolute",
                zIndex: 200,
                minWidth: "220px",
                maxHeight: "220px",
                overflow: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                padding: "0",
              }}
            >
              {availableParams.length === 0 && (
                <div
                  style={{
                    padding: "8px 12px",
                    color: "var(--muted)",
                    fontSize: "12px",
                  }}
                >
                  All known params already present
                </div>
              )}
              {availableParams.map(p => (
                <button
                  key={p.key}
                  onClick={() => addParam(p)}
                  className="playground-button playground-button--ghost"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 12px",
                    border: "none",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={addCustom}
                className="playground-button playground-button--ghost"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 12px",
                  border: "none",
                  fontStyle: "italic",
                }}
              >
                + Custom key…
              </button>
            </div>
          )}
        </span>
      </div>
    </div>
  );
}
