import { h } from "preact";
import { useState } from "preact/hooks";
import { activeFeature } from "../signals";
import { JsonView } from "./JsonView";
import { DiagnosticsWaterfall } from "./DiagnosticsWaterfall";
import { toImageSrc } from "../imageSrc";

type Warning = { code: string; message: string; details?: unknown };
type DiagnosticStep = {
  name: string;
  status: string;
  code?: string;
  durationMs?: number;
};

function imagePreview(value: string, alt: string) {
  const src = toImageSrc(value);
  return (
    <a href={src} target="_blank" rel="noopener noreferrer">
      <img
        src={src}
        alt={alt}
        style={{
          maxWidth: "100%",
          border: "1px solid var(--line)",
          display: "block",
        }}
      />
    </a>
  );
}

function renderActions(value: unknown) {
  const actions = value as { screenshots?: unknown };
  const screenshots = Array.isArray(actions.screenshots)
    ? actions.screenshots.filter((x): x is string => typeof x === "string")
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {screenshots.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "8px",
          }}
        >
          {screenshots.map((screenshot, i) => (
            <div key={i}>
              {imagePreview(screenshot, `action-screenshot-${i}`)}
            </div>
          ))}
        </div>
      )}
      <JsonView value={value as object} collapsed={2} />
    </div>
  );
}

type Props = {
  body: Record<string, unknown>;
  warnings?: Warning[];
  legacyWarning?: string;
};

// ── Format tab definitions ─────────────────────────────────────────────────

type FormatTab = {
  id: string;
  label: string;
  dataKey: string;
  render: (value: unknown) => h.JSX.Element;
};

function pre(content: string) {
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
        maxHeight: "420px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      }}
    >
      {content}
    </pre>
  );
}

const FORMAT_TABS: FormatTab[] = [
  {
    id: "markdown",
    label: "Markdown",
    dataKey: "markdown",
    render: v => pre(v as string),
  },
  {
    id: "html",
    label: "HTML",
    dataKey: "html",
    render: v => pre(v as string),
  },
  {
    id: "rawHtml",
    label: "Raw HTML",
    dataKey: "rawHtml",
    render: v => pre(v as string),
  },
  {
    id: "screenshot",
    label: "Screenshot",
    dataKey: "screenshot",
    render: v => imagePreview(v as string, "screenshot"),
  },
  {
    id: "json",
    label: "JSON",
    dataKey: "json",
    render: v => <JsonView value={v as object} collapsed={2} />,
  },
  {
    id: "extract",
    label: "Extract",
    dataKey: "extract",
    render: v => <JsonView value={v as object} collapsed={2} />,
  },
  {
    id: "links",
    label: "Links",
    dataKey: "links",
    render: v => (
      <div
        style={{
          padding: "10px",
          background: "var(--field)",
          border: "1px solid var(--line)",
          maxHeight: "400px",
          overflow: "auto",
        }}
      >
        {(v as string[]).map((link, i) => (
          <div
            key={i}
            style={{ padding: "3px 0", borderBottom: "1px solid var(--line)" }}
          >
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--accent)",
                fontSize: "12px",
                textDecoration: "none",
                fontFamily:
                  "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
                wordBreak: "break-all",
              }}
            >
              {link}
            </a>
          </div>
        ))}
        <div
          style={{
            marginTop: "6px",
            fontSize: "11px",
            color: "var(--muted)",
          }}
        >
          {(v as string[]).length} link{(v as string[]).length === 1 ? "" : "s"}
        </div>
      </div>
    ),
  },
  {
    id: "images",
    label: "Images",
    dataKey: "images",
    render: v => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: "8px",
          maxHeight: "400px",
          overflow: "auto",
          padding: "4px",
        }}
      >
        {(v as string[]).map((src, i) => (
          <a key={i} href={src} target="_blank" rel="noopener noreferrer">
            <img
              src={toImageSrc(src)}
              alt={`img-${i}`}
              style={{
                width: "100%",
                height: "80px",
                objectFit: "cover",
                border: "1px solid var(--line)",
                display: "block",
              }}
              onError={(e: Event) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </a>
        ))}
      </div>
    ),
  },
  {
    id: "summary",
    label: "Summary",
    dataKey: "summary",
    render: v => pre(v as string),
  },
  {
    id: "answer",
    label: "Answer",
    dataKey: "answer",
    render: v => pre(v as string),
  },
  {
    id: "highlights",
    label: "Highlights",
    dataKey: "highlights",
    render: v => pre(v as string),
  },
  {
    id: "changeTracking",
    label: "Changes",
    dataKey: "changeTracking",
    render: v => {
      const ct = v as Record<string, unknown>;
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            style={{
              display: "flex",
              gap: "12px",
              padding: "8px 12px",
              background: "var(--field)",
              border: "1px solid var(--line)",
              fontSize: "12px",
            }}
          >
            <span style={{ color: "var(--muted)" }}>Status:</span>
            <strong style={{ color: "var(--ink)" }}>
              {String(ct.changeStatus ?? "—")}
            </strong>
            {ct.previousScrapeAt && (
              <>
                <span style={{ color: "var(--muted)" }}>Previous:</span>
                <span style={{ color: "var(--ink)" }}>
                  {String(ct.previousScrapeAt)}
                </span>
              </>
            )}
          </div>
          {ct.diff && <JsonView value={ct.diff as object} collapsed={1} />}
        </div>
      );
    },
  },
  {
    id: "attributes",
    label: "Attributes",
    dataKey: "attributes",
    render: v => <JsonView value={v as object} collapsed={2} />,
  },
  {
    id: "branding",
    label: "Branding",
    dataKey: "branding",
    render: v => <JsonView value={v as object} collapsed={2} />,
  },
  {
    id: "audio",
    label: "Audio",
    dataKey: "audio",
    render: v => (
      <audio
        controls
        src={v as string}
        style={{ width: "100%", marginTop: "4px" }}
      />
    ),
  },
  {
    id: "video",
    label: "Video",
    dataKey: "video",
    render: v => (
      <video
        controls
        src={v as string}
        style={{ width: "100%", maxHeight: "300px", background: "#000" }}
      />
    ),
  },
  {
    id: "actions",
    label: "Actions",
    dataKey: "actions",
    render: renderActions,
  },
];

// ── Tab bar styles ─────────────────────────────────────────────────────────

const TAB_STYLE_BASE = {
  padding: "6px 12px",
  background: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  cursor: "pointer",
  font: "700 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
  whiteSpace: "nowrap" as const,
  marginBottom: "-1px",
};

function tabStyle(active: boolean) {
  return {
    ...TAB_STYLE_BASE,
    color: active ? "var(--ink)" : "var(--muted)",
    borderBottomColor: active ? "var(--accent)" : "transparent",
  };
}

// ── Warning banner ─────────────────────────────────────────────────────────

function WarningBanner({
  warnings,
  legacyWarning,
}: {
  warnings?: Warning[];
  legacyWarning?: string;
}) {
  if (!warnings?.length && !legacyWarning) return null;
  const all = warnings ?? [];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        padding: "8px 12px",
        background: "var(--accent-soft)",
        border: "1px solid #573121",
        borderBottom: "none",
      }}
    >
      {all.map((w, i) => (
        <div
          key={i}
          style={{ display: "flex", gap: "8px", alignItems: "baseline" }}
        >
          <code style={{ color: "#ffb196", fontSize: "11px", flexShrink: 0 }}>
            {w.code}
          </code>
          <span style={{ color: "var(--ink)", fontSize: "12px" }}>
            {w.message}
          </span>
        </div>
      ))}
      {!all.length && legacyWarning && (
        <span style={{ color: "#ffb196", fontSize: "12px" }}>
          {legacyWarning}
        </span>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export function SuccessView({ body, warnings, legacyWarning }: Props) {
  const feature = activeFeature.value;

  // Non-scrape features: simple fallback
  if (feature !== "scrape") {
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
    return <JsonView value={body} />;
  }

  // Scrape: tabbed view
  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : {};
  const diagnostics = body.diagnostics as Record<string, unknown> | undefined;
  const steps = (diagnostics?.steps as DiagnosticStep[] | undefined) ?? [];
  const metadata = data.metadata ?? body.metadata;

  // Find which format tabs have data
  const activeFormatTabs = FORMAT_TABS.filter(t => {
    const v = data[t.dataKey];
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });

  // Default to markdown tab if present, otherwise first available, else meta
  const defaultTab =
    activeFormatTabs.find(t => t.id === "markdown")?.id ??
    activeFormatTabs[0]?.id ??
    "meta";

  const [activeTab, setActiveTab] = useState(defaultTab);

  // Ensure tab is valid when data changes
  const validTab =
    activeFormatTabs.some(t => t.id === activeTab) ||
    activeTab === "meta" ||
    activeTab === "diagnostics"
      ? activeTab
      : defaultTab;

  const activeFormatTab = FORMAT_TABS.find(t => t.id === validTab);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          borderBottom: "1px solid var(--line)",
          flexWrap: "wrap" as const,
          rowGap: 0,
        }}
      >
        {/* Dynamic format tabs */}
        {activeFormatTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={tabStyle(validTab === tab.id)}
          >
            {tab.label}
          </button>
        ))}

        {/* Separator if both groups present */}
        {activeFormatTabs.length > 0 && (
          <span
            style={{
              borderLeft: "1px solid var(--line)",
              height: "20px",
              margin: "0 4px 2px",
              alignSelf: "center",
            }}
          />
        )}

        {/* Fixed tabs */}
        <button
          onClick={() => setActiveTab("meta")}
          style={tabStyle(validTab === "meta")}
        >
          Meta
        </button>
        <button
          onClick={() => setActiveTab("diagnostics")}
          style={tabStyle(validTab === "diagnostics")}
        >
          Diag{steps.length > 0 ? ` (${steps.length})` : ""}
        </button>
      </div>

      {/* Warning banner */}
      <WarningBanner warnings={warnings} legacyWarning={legacyWarning} />

      {/* Tab content */}
      <div style={{ paddingTop: "12px" }}>
        {validTab === "meta" && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            {metadata ? (
              <JsonView value={metadata as object} collapsed={1} />
            ) : (
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--muted)",
                  fontStyle: "italic",
                }}
              >
                No metadata
              </div>
            )}
          </div>
        )}

        {validTab === "diagnostics" && (
          <div>
            {steps.length > 0 ? (
              <DiagnosticsWaterfall steps={steps} />
            ) : (
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--muted)",
                  fontStyle: "italic",
                }}
              >
                No diagnostic steps
              </div>
            )}
          </div>
        )}

        {activeFormatTab &&
          data[activeFormatTab.dataKey] !== undefined &&
          activeFormatTab.render(data[activeFormatTab.dataKey])}

        {!activeFormatTab &&
          validTab !== "meta" &&
          validTab !== "diagnostics" && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--muted)",
                fontStyle: "italic",
              }}
            >
              No data for this format
            </div>
          )}
      </div>
    </div>
  );
}
