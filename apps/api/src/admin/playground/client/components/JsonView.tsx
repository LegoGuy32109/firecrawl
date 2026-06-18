import { h } from "preact";

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
}

export function JsonView({ value, style, className = "" }: JsonViewProps) {
  const json = JSON.stringify(value, null, 2) ?? "null";
  return (
    <pre
      className={["playground-pre", className].filter(Boolean).join(" ")}
      style={style}
      dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }}
    />
  );
}
