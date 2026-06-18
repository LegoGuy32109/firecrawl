import { h } from "preact";
import { activeFeature, type Feature } from "../signals";
import { Tab } from "./ui/Tabs";

const FEATURES: Feature[] = [
  "scrape",
  "search",
  "crawl",
  "map",
  "extract",
  "agent",
];

export function FeatureNav() {
  return (
    <nav className="playground-tabs playground-tabs--spaced">
      {FEATURES.map(f => {
        const active = activeFeature.value === f;
        return (
          <Tab
            key={f}
            active={active}
            onClick={() => {
              activeFeature.value = f;
            }}
          >
            {f}
          </Tab>
        );
      })}
    </nav>
  );
}
