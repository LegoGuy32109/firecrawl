import { h } from "preact";
import { activeFeature } from "../signals";

type Props = {
  body: Record<string, unknown>;
};

export function SuccessView({ body }: Props) {
  const feature = activeFeature.value;

  if (feature === "scrape" && body.data && typeof body.data === "object") {
    const data = body.data as Record<string, unknown>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {data.markdown && typeof data.markdown === "string" && (
          <div>
            <div
              style={{
                color: "var(--muted)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "6px",
              }}
            >
              Markdown
            </div>
            <pre
              style={{
                margin: 0,
                padding: "10px",
                background: "var(--field)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                fontSize: "12px",
                overflow: "auto",
                maxHeight: "300px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {data.markdown as string}
            </pre>
          </div>
        )}
        {data.metadata && (
          <div>
            <div
              style={{
                color: "var(--muted)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "6px",
              }}
            >
              Metadata
            </div>
            <pre
              style={{
                margin: 0,
                padding: "10px",
                background: "var(--field)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
                fontSize: "12px",
                overflow: "auto",
                maxHeight: "200px",
              }}
            >
              {JSON.stringify(data.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if ((feature === "crawl" || feature === "agent") && body.id) {
    return (
      <div
        style={{
          padding: "12px",
          background: "var(--field)",
          border: "1px solid var(--line)",
        }}
      >
        <div
          style={{
            color: "var(--muted)",
            fontSize: "11px",
            marginBottom: "4px",
          }}
        >
          JOB ID
        </div>
        <code style={{ color: "var(--accent)", fontSize: "14px" }}>
          {String(body.id)}
        </code>
        {body.status && (
          <div
            style={{
              color: "var(--muted)",
              fontSize: "12px",
              marginTop: "6px",
            }}
          >
            Status: {String(body.status)}
          </div>
        )}
      </div>
    );
  }

  return (
    <pre
      style={{
        margin: 0,
        padding: "10px",
        background: "var(--field)",
        border: "1px solid var(--line)",
        color: "var(--ink)",
        fontSize: "12px",
        overflow: "auto",
        maxHeight: "500px",
      }}
    >
      {JSON.stringify(body, null, 2)}
    </pre>
  );
}
