import { h } from "preact";
import { activeFeature, activeView, type Feature } from "../signals";
import { Tab } from "./ui/Tabs";

const FEATURES: { id: Feature; label: string }[] = [
  { id: "scrape", label: "Scrape" },
  { id: "interact", label: "Interact" },
];

export function FeatureNav() {
  return (
    <nav className="playground-tabs playground-tabs--spaced">
      {FEATURES.map(f => {
        const active = activeFeature.value === f.id;
        return (
          <Tab
            key={f.id}
            active={active}
            onClick={() => {
              activeFeature.value = f.id;
            }}
          >
            {f.label}
          </Tab>
        );
      })}
      <span className="playground-tabs__spacer" />
      <Tab
        active={activeView.value === "history"}
        className="playground-tab--history"
        onClick={() => {
          activeView.value = "history";
        }}
      >
        History
      </Tab>
    </nav>
  );
}
