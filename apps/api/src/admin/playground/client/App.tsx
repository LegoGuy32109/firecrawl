import { h } from "preact";
import { Header } from "./components/Header";
import { FeatureNav } from "./components/FeatureNav";
import { RequestBuilder } from "./components/RequestBuilder";
import { ResponsePane } from "./components/ResponsePane";

export function App() {
  return (
    <div>
      <Header />
      <FeatureNav />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          alignItems: "start",
        }}
      >
        <div
          style={{
            padding: "16px",
            background: "var(--panel)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              color: "var(--muted)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "14px",
            }}
          >
            Request
          </div>
          <RequestBuilder />
        </div>
        <div
          style={{
            padding: "16px",
            background: "var(--panel)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              color: "var(--muted)",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: "14px",
            }}
          >
            Response
          </div>
          <ResponsePane />
        </div>
      </div>
    </div>
  );
}
