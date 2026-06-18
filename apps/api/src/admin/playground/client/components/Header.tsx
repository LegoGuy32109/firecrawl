import { h } from "preact";
import { apiKey } from "../signals";
import { LLMProxyStatus } from "./LLMProxyStatus";

export function Header() {
  const env = document.getElementById("root")?.dataset.env ?? "";
  const base = `${location.protocol}//${location.host}`;

  return (
    <header
      style={{
        display: "grid",
        gap: "12px",
        marginBottom: "16px",
        padding: "16px 0",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "18px", letterSpacing: "-0.02em" }}>
          Firecrawl Playground
        </h1>
        <LLMProxyStatus />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0,1fr))",
          gap: "12px",
        }}
      >
        <label
          style={{
            display: "grid",
            gap: "6px",
            color: "var(--muted)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          ENV
          <input
            readonly
            value={env}
            style={{
              width: "100%",
              padding: "10px 11px",
              border: "1px solid var(--line)",
              background: "var(--field)",
              color: "var(--ink)",
              font: "13px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
            }}
          />
        </label>
        <label
          style={{
            display: "grid",
            gap: "6px",
            color: "var(--muted)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Base
          <input
            readonly
            value={base}
            style={{
              width: "100%",
              padding: "10px 11px",
              border: "1px solid var(--line)",
              background: "var(--field)",
              color: "var(--ink)",
              font: "13px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
            }}
          />
        </label>
        <label
          style={{
            display: "grid",
            gap: "6px",
            color: "var(--muted)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          API Key (optional)
          <input
            type="password"
            placeholder="fc-..."
            value={apiKey.value}
            onInput={e => {
              apiKey.value = (e.target as HTMLInputElement).value;
            }}
            style={{
              width: "100%",
              padding: "10px 11px",
              border: "1px solid var(--line)",
              background: "var(--field)",
              color: "var(--ink)",
              font: "13px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
            }}
          />
        </label>
      </div>
    </header>
  );
}
