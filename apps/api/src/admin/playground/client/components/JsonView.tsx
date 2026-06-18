import { h } from "preact";

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
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
}

export function JsonView({ value, style }: JsonViewProps) {
  const json = JSON.stringify(value, null, 2) ?? "null";
  return (
    <pre
      style={{
        margin: 0,
        padding: "12px",
        overflowX: "auto",
        fontFamily: "ui-monospace, monospace",
        fontSize: "13px",
        lineHeight: 1.5,
        background: "var(--field, #0b1017)",
        color: "var(--ink, #eef3f8)",
        borderRadius: "4px",
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }}
    />
  );
}
