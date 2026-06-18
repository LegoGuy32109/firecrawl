import { h } from "preact";
import { useState, useEffect, useRef } from "preact/hooks";
import JsonViewEditor from "@uiw/react-json-view/editor";
import JsonViewBase from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";

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

const baseStyle: React.CSSProperties = {
  ...darkTheme,
  background: "var(--field)",
  fontSize: "12px",
  fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  padding: "10px",
  border: "1px solid var(--line)",
  overflow: "auto",
  maxHeight: "400px",
  minHeight: "80px",
};

export function JsonEditor({ value, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unsupportedKeys = Object.keys(value).filter(k =>
    ENGINE_UNSUPPORTED.has(k),
  );
  const availableParams = SCRAPE_KNOWN_PARAMS.filter(p => !(p.key in value));

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

  const handleKeyRename = (option: {
    value: unknown;
    oldValue: unknown;
    keyName?: string | number;
  }) => {
    const newKey = String(option.value);
    const origKey = String(option.keyName ?? "");
    if (!newKey || newKey === origKey) return false;
    const updated: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      updated[k === origKey ? newKey : k] = value[k];
    }
    onChange(updated);
    return true;
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
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {unsupportedKeys.length > 0 && (
        <div
          style={{
            padding: "8px 12px",
            background: "var(--accent-soft)",
            border: "1px solid #573121",
            color: "#ffb196",
            fontSize: "12px",
          }}
        >
          ⚠ <code>{unsupportedKeys.join(", ")}</code>{" "}
          {unsupportedKeys.length === 1 ? "is" : "are"} not supported by the
          local CDP engine — expect <code>FEATURE_UNSUPPORTED_LOCALLY</code>
        </div>
      )}

      <JsonViewEditor
        value={value}
        style={baseStyle}
        collapsed={false}
        displayDataTypes={false}
        displayObjectSize={false}
        enableClipboard
        onEdit={
          handleKeyRename as Parameters<typeof JsonViewEditor>[0]["onEdit"]
        }
      >
        <JsonViewBase.CountInfoExtra
          render={(_props, { keyName }) => {
            // Only render the add button at the root level
            if (
              keyName !== undefined &&
              keyName !== null &&
              keyName !== "root"
            ) {
              return null;
            }
            return (
              <span
                style={{ position: "relative", display: "inline-block" }}
                ref={dropdownRef}
              >
                <button
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    setAddOpen(o => !o);
                  }}
                  title="Add parameter"
                  style={{
                    marginLeft: "6px",
                    padding: "1px 7px",
                    background: "transparent",
                    color: "var(--muted)",
                    border: "1px solid var(--line)",
                    cursor: "pointer",
                    font: "11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
                    verticalAlign: "middle",
                  }}
                >
                  +
                </button>
                {addOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      zIndex: 200,
                      background: "var(--panel)",
                      border: "1px solid var(--line)",
                      minWidth: "220px",
                      maxHeight: "220px",
                      overflow: "auto",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
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
                        style={{
                          display: "block",
                          width: "100%",
                          padding: "6px 12px",
                          background: "transparent",
                          color: "var(--ink)",
                          border: "none",
                          borderBottom: "1px solid var(--line)",
                          cursor: "pointer",
                          font: "12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
                          textAlign: "left",
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                    <button
                      onClick={addCustom}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 12px",
                        background: "transparent",
                        color: "var(--muted)",
                        border: "none",
                        cursor: "pointer",
                        font: "italic 12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
                        textAlign: "left",
                      }}
                    >
                      + Custom key…
                    </button>
                  </div>
                )}
              </span>
            );
          }}
        />
      </JsonViewEditor>
    </div>
  );
}
