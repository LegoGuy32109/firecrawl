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

type Props = {
  body: Record<string, unknown>;
  warnings?: Warning[];
  legacyWarning?: string;
};

type FormatTab = {
  id: string;
  label: string;
  dataKey: string;
  render: (value: unknown) => h.JSX.Element;
};

function imagePreview(value: string, alt: string) {
  const src = toImageSrc(value);
  return (
    <a
      className="playground-media-tile"
      href={src}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img className="playground-media-image" src={src} alt={alt} />
    </a>
  );
}

function renderActions(value: unknown) {
  const actions = value as { screenshots?: unknown };
  const screenshots = Array.isArray(actions.screenshots)
    ? actions.screenshots.filter((x): x is string => typeof x === "string")
    : [];

  return (
    <div className="playground-stack">
      {screenshots.length > 0 && (
        <div className="playground-media-grid playground-media-grid--actions">
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

function pre(content: string) {
  return (
    <pre className="playground-pre playground-pre--compact">{content}</pre>
  );
}

const FORMAT_TABS: FormatTab[] = [
  {
    id: "markdown",
    label: "Markdown",
    dataKey: "markdown",
    render: v => pre(v as string),
  },
  { id: "html", label: "HTML", dataKey: "html", render: v => pre(v as string) },
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
      <div className="playground-link-list">
        {(v as string[]).map((link, i) => (
          <div key={i} className="playground-link-list__item">
            <a
              className="playground-link"
              href={link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link}
            </a>
          </div>
        ))}
        <div
          className="playground-muted"
          style={{ marginTop: "6px", fontSize: "11px" }}
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
      <div className="playground-media-grid">
        {(v as string[]).map((src, i) => {
          const imageSrc = toImageSrc(src);
          return (
            <a
              key={i}
              className="playground-media-tile"
              href={imageSrc}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="playground-media-image playground-media-image--small"
                src={imageSrc}
                alt={`img-${i}`}
                onError={(e: Event) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </a>
          );
        })}
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
        <div className="playground-stack">
          <div className="playground-surface">
            <div className="playground-row">
              <span className="playground-muted">Status:</span>
              <strong>{String(ct.changeStatus ?? "—")}</strong>
              {ct.previousScrapeAt && (
                <>
                  <span className="playground-muted">Previous:</span>
                  <span>{String(ct.previousScrapeAt)}</span>
                </>
              )}
            </div>
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
      <audio controls src={v as string} className="playground-media-audio" />
    ),
  },
  {
    id: "video",
    label: "Video",
    dataKey: "video",
    render: v => (
      <video controls src={v as string} className="playground-media-video" />
    ),
  },
  {
    id: "actions",
    label: "Actions",
    dataKey: "actions",
    render: renderActions,
  },
];

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
    <div className="playground-response__banner">
      {all.map((w, i) => (
        <div key={i} className="playground-response__banner-row">
          <code className="playground-response__banner-code">{w.code}</code>
          <span className="playground-response__banner-text">{w.message}</span>
        </div>
      ))}
      {!all.length && legacyWarning && (
        <span className="playground-response__banner-code">
          {legacyWarning}
        </span>
      )}
    </div>
  );
}

export function SuccessView({ body, warnings, legacyWarning }: Props) {
  const feature = activeFeature.value;

  if (feature !== "scrape") {
    if ((feature === "crawl" || feature === "agent") && body.id) {
      return (
        <div className="playground-surface">
          <div className="playground-surface__label">Job ID</div>
          <code
            className="playground-code"
            style={{ color: "var(--accent)", fontSize: "14px" }}
          >
            {String(body.id)}
          </code>
          {body.status && (
            <div className="playground-response__job-status">
              Status: {String(body.status)}
            </div>
          )}
        </div>
      );
    }

    return <JsonView value={body} />;
  }

  const data =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : {};
  const diagnostics = body.diagnostics as Record<string, unknown> | undefined;
  const steps = (diagnostics?.steps as DiagnosticStep[] | undefined) ?? [];

  const activeFormatTabs = FORMAT_TABS.filter(t => {
    const v = data[t.dataKey];
    if (v === null || v === undefined || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  });

  const defaultTab =
    activeFormatTabs.find(t => t.id === "markdown")?.id ??
    activeFormatTabs[0]?.id ??
    "meta";

  const [activeTab, setActiveTab] = useState(defaultTab);

  const validTab =
    activeFormatTabs.some(t => t.id === activeTab) ||
    activeTab === "meta" ||
    activeTab === "diagnostics"
      ? activeTab
      : defaultTab;

  const activeFormatTab = FORMAT_TABS.find(t => t.id === validTab);

  return (
    <div>
      <div className="playground-response-tabs">
        {activeFormatTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={[
              "playground-tab",
              validTab === tab.id && "playground-tab--active",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {tab.label}
          </button>
        ))}

        {activeFormatTabs.length > 0 && (
          <span className="playground-response-tabs__separator" />
        )}

        <button
          type="button"
          onClick={() => setActiveTab("meta")}
          className={[
            "playground-tab",
            validTab === "meta" && "playground-tab--active",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          Meta
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("diagnostics")}
          className={[
            "playground-tab",
            validTab === "diagnostics" && "playground-tab--active",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          Diag{steps.length > 0 ? ` (${steps.length})` : ""}
        </button>
      </div>

      <WarningBanner warnings={warnings} legacyWarning={legacyWarning} />

      <div className="playground-response__content">
        {validTab === "meta" && (
          <div className="playground-stack">
            {body.metadata && (
              <JsonView value={body.metadata as object} collapsed={2} />
            )}
            {!body.metadata && data.metadata && (
              <JsonView value={data.metadata as object} collapsed={2} />
            )}
          </div>
        )}

        {validTab === "diagnostics" && <DiagnosticsWaterfall steps={steps} />}

        {activeFormatTab &&
          activeFormatTabs.some(t => t.id === validTab) &&
          activeFormatTab.render(data[activeFormatTab.dataKey])}

        {!activeFormatTabs.some(t => t.id === validTab) &&
          validTab !== "meta" &&
          validTab !== "diagnostics" && (
            <div className="playground-muted">No data for this tab</div>
          )}
      </div>
    </div>
  );
}
