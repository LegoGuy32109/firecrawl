import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Button } from "./ui/Button";

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    match => {
      let cls = "color:#ce9178"; // string
      if (/^"/.test(match)) {
        if (/:$/.test(match)) cls = "color:#9cdcfe"; // key
      } else if (/true|false/.test(match)) {
        cls = "color:#4fc1ff"; // boolean
      } else if (/null/.test(match)) {
        cls = "color:#808080"; // null
      } else {
        cls = "color:#b5cea8"; // number
      }
      return `<span style="${cls}">${match}</span>`;
    },
  );
}

interface JsonViewProps {
  value: unknown;
  style?: h.JSX.CSSProperties;
  className?: string;
  collapsed?: number | boolean;
}

export function JsonView({ value, style, className = "" }: JsonViewProps) {
  const json = JSON.stringify(value, null, 2) ?? "null";
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyJson = () => {
    const writer = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    if (!writer) return;
    void writer(json).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };

  return (
    <div className="playground-json-view">
      <div className="playground-row playground-row--between playground-json-view__toolbar">
        <span className="playground-muted" style={{ fontSize: "11px" }}>
          JSON
        </span>
        <Button type="button" onClick={copyJson} size="xs">
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        className={["playground-pre", className].filter(Boolean).join(" ")}
        style={style}
        dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }}
      />
    </div>
  );
}
