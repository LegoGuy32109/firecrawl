import { h } from "preact";
import { Header } from "./components/Header";
import { FeatureNav } from "./components/FeatureNav";
import { RequestBuilder } from "./components/RequestBuilder";
import { ResponsePane } from "./components/ResponsePane";
import { LiveView } from "./components/LiveView";
import { RecorderPanel } from "./components/RecorderPanel";

const panelStyle = {
  padding: "16px",
  background: "var(--panel)",
  border: "1px solid var(--line)",
};

const panelLabelStyle = {
  color: "var(--muted)",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
  marginBottom: "14px",
};

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
        <div style={panelStyle}>
          <div style={panelLabelStyle}>Request</div>
          <RequestBuilder />
        </div>
        <div style={panelStyle}>
          <div style={panelLabelStyle}>Response</div>
          <ResponsePane />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "24px",
          alignItems: "start",
          marginTop: "24px",
        }}
      >
        <div style={panelStyle}>
          <div style={panelLabelStyle}>Live view</div>
          <LiveView />
        </div>
        <div style={panelStyle}>
          <div style={panelLabelStyle}>Actions</div>
          <RecorderPanel />
        </div>
      </div>
    </div>
  );
}
