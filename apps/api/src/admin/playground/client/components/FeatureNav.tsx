import { h } from "preact";
import { activeFeature, type Feature } from "../signals";

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
    <nav
      style={{
        display: "flex",
        gap: "4px",
        marginBottom: "16px",
        borderBottom: "1px solid var(--line)",
        paddingBottom: "0",
      }}
    >
      {FEATURES.map(f => {
        const active = activeFeature.value === f;
        return (
          <button
            key={f}
            onClick={() => {
              activeFeature.value = f;
            }}
            style={{
              padding: "8px 16px",
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#fff" : "var(--muted)",
              border: "none",
              borderBottom: active
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              cursor: "pointer",
              font: "700 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
              textTransform: "capitalize",
              letterSpacing: "0.04em",
              marginBottom: "-1px",
            }}
          >
            {f}
          </button>
        );
      })}
    </nav>
  );
}
