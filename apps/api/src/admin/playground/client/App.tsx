import { h } from "preact";
import { Header } from "./components/Header";
import { FeatureNav } from "./components/FeatureNav";
import { RequestBuilder } from "./components/RequestBuilder";
import { ResponsePane } from "./components/ResponsePane";
import { LiveView } from "./components/LiveView";
import { RecorderPanel } from "./components/RecorderPanel";
import { Panel } from "./components/ui/Panel";

export function App() {
  return (
    <div className="playground-shell">
      <Header />
      <FeatureNav />
      <div className="playground-grid playground-grid--two">
        <Panel label="Request">
          <RequestBuilder />
        </Panel>
        <Panel label="Response">
          <ResponsePane />
        </Panel>
      </div>

      <div className="playground-grid playground-grid--wide-left">
        <Panel label="Live view">
          <LiveView />
        </Panel>
        <Panel label="Actions">
          <RecorderPanel />
        </Panel>
      </div>
    </div>
  );
}
