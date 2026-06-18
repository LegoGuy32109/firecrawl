import { h, Fragment } from "preact";
import { SchemaEditor } from "./SchemaEditor";

type FormatObj = { type: string; [k: string]: unknown };

type Props = {
  formats: FormatObj[];
  onChange: (formats: FormatObj[]) => void;
};

// Mutual exclusion rules: key → array of types it blocks
const BLOCKS: Record<string, string[]> = {
  json: ["deterministicJson"],
  deterministicJson: ["json"],
};

// Types that require markdown to also be present
const REQUIRES_MARKDOWN = new Set(["changeTracking"]);

const labelStyle = {
  color: "var(--muted)",
  fontSize: "11px",
  fontWeight: 700 as const,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

const inputStyle = {
  width: "100%",
  padding: "6px 8px",
  background: "var(--field)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  font: "12px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
};

type SimpleFormatDef = { type: string; label: string };
type ComplexFormatDef = {
  type: string;
  label: string;
  complex: true;
};
type FormatDef = SimpleFormatDef | ComplexFormatDef;

const SIMPLE_FORMATS: SimpleFormatDef[] = [
  { type: "markdown", label: "Markdown" },
  { type: "html", label: "HTML" },
  { type: "rawHtml", label: "Raw HTML" },
  { type: "links", label: "Links" },
  { type: "images", label: "Images" },
  { type: "summary", label: "Summary" },
  { type: "highlights", label: "Highlights" },
  { type: "branding", label: "Branding" },
  { type: "audio", label: "Audio" },
  { type: "video", label: "Video" },
];

const COMPLEX_FORMATS: ComplexFormatDef[] = [
  { type: "screenshot", label: "Screenshot", complex: true },
  { type: "json", label: "JSON Extract", complex: true },
  { type: "deterministicJson", label: "Deterministic JSON", complex: true },
  { type: "changeTracking", label: "Change Tracking", complex: true },
  { type: "attributes", label: "Attributes", complex: true },
  { type: "question", label: "Question / Answer", complex: true },
];

function isEnabled(formats: FormatObj[], type: string) {
  return formats.some(f => f.type === type);
}

function getFormat(formats: FormatObj[], type: string): FormatObj | undefined {
  return formats.find(f => f.type === type);
}

function isBlocked(formats: FormatObj[], type: string): string | null {
  const blockedBy = BLOCKS[type];
  if (!blockedBy) return null;
  // check if any format that blocks `type` is active
  for (const [blocker, blocked] of Object.entries(BLOCKS)) {
    if (blocked.includes(type) && isEnabled(formats, blocker)) {
      return blocker;
    }
  }
  return null;
}

function toggle(
  formats: FormatObj[],
  type: string,
  defaultFormat: FormatObj,
): FormatObj[] {
  if (isEnabled(formats, type)) {
    return formats.filter(f => f.type !== type);
  }
  return [...formats, defaultFormat];
}

function updateFormat(
  formats: FormatObj[],
  type: string,
  patch: Partial<FormatObj>,
): FormatObj[] {
  return formats.map(f => (f.type === type ? { ...f, ...patch } : f));
}

const cardStyle = (active: boolean, blocked: boolean) => ({
  border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
  background: active ? "rgba(255,100,0,0.06)" : "var(--field)",
  padding: "10px 12px",
  opacity: blocked ? 0.45 : 1,
  transition: "border-color 0.15s, background 0.15s",
});

const toggleBtnStyle = (active: boolean, blocked: boolean) => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  cursor: blocked ? "not-allowed" : "pointer",
  background: "none",
  border: "none",
  padding: 0,
  width: "100%",
  color: active ? "var(--ink)" : "var(--muted)",
  font: `${active ? 700 : 400} 12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`,
  textAlign: "left" as const,
});

function Dot({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        border: `2px solid ${active ? "var(--accent)" : "var(--muted)"}`,
        background: active ? "var(--accent)" : "transparent",
        flexShrink: 0,
        transition: "background 0.15s, border-color 0.15s",
      }}
    />
  );
}

function ScreenshotOptions({
  fmt,
  onChange,
}: {
  fmt: FormatObj;
  onChange: (patch: Partial<FormatObj>) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "8px",
        marginTop: "10px",
      }}
    >
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={labelStyle}>Full Page</span>
        <input
          type="checkbox"
          checked={!!fmt.fullPage}
          onChange={e =>
            onChange({ fullPage: (e.target as HTMLInputElement).checked })
          }
          style={{ width: "16px", height: "16px" }}
        />
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={labelStyle}>Quality (1–100)</span>
        <input
          type="number"
          min={1}
          max={100}
          value={(fmt.quality as number) ?? 80}
          onInput={e =>
            onChange({ quality: Number((e.target as HTMLInputElement).value) })
          }
          style={inputStyle}
        />
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={labelStyle}>Width (px)</span>
        <input
          type="number"
          value={(fmt.viewport as { width?: number })?.width ?? 1280}
          onInput={e => {
            const vp =
              (fmt.viewport as { width?: number; height?: number }) ?? {};
            onChange({
              viewport: {
                ...vp,
                width: Number((e.target as HTMLInputElement).value),
              },
            });
          }}
          style={inputStyle}
        />
      </label>
    </div>
  );
}

function JsonOptions({
  fmt,
  onChange,
}: {
  fmt: FormatObj;
  onChange: (patch: Partial<FormatObj>) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        marginTop: "10px",
      }}
    >
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={labelStyle}>Prompt</span>
        <textarea
          value={(fmt.prompt as string) ?? ""}
          onInput={e =>
            onChange({ prompt: (e.target as HTMLTextAreaElement).value })
          }
          rows={2}
          placeholder="Extract the following fields…"
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>
      <SchemaEditor
        label="Schema"
        value={
          (fmt.schema as Record<string, unknown>) ?? {
            type: "object",
            properties: {},
          }
        }
        onChange={schema => onChange({ schema })}
      />
    </div>
  );
}

function ChangeTrackingOptions({
  fmt,
  onChange,
}: {
  fmt: FormatObj;
  onChange: (patch: Partial<FormatObj>) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "8px",
        marginTop: "10px",
      }}
    >
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={labelStyle}>Mode</span>
        <select
          value={(fmt.mode as string) ?? "json"}
          onChange={e =>
            onChange({ mode: (e.target as HTMLSelectElement).value })
          }
          style={inputStyle}
        >
          <option value="json">json</option>
          <option value="git-diff">git-diff</option>
        </select>
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={labelStyle}>Tag</span>
        <input
          type="text"
          value={(fmt.tag as string) ?? ""}
          onInput={e =>
            onChange({ tag: (e.target as HTMLInputElement).value || undefined })
          }
          placeholder="optional tag"
          style={inputStyle}
        />
      </label>
    </div>
  );
}

type AttributeSelector = { selector: string; attribute: string };

function AttributesOptions({
  fmt,
  onChange,
}: {
  fmt: FormatObj;
  onChange: (patch: Partial<FormatObj>) => void;
}) {
  const selectors: AttributeSelector[] =
    (fmt.selectors as AttributeSelector[]) ?? [];

  const updateSelector = (
    i: number,
    field: keyof AttributeSelector,
    val: string,
  ) => {
    const updated = selectors.map((s, idx) =>
      idx === i ? { ...s, [field]: val } : s,
    );
    onChange({ selectors: updated });
  };

  const addSelector = () =>
    onChange({
      selectors: [...selectors, { selector: "", attribute: "href" }],
    });

  const removeSelector = (i: number) =>
    onChange({ selectors: selectors.filter((_, idx) => idx !== i) });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        marginTop: "10px",
      }}
    >
      {selectors.map((s, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: "6px",
            alignItems: "end",
          }}
        >
          <label style={{ display: "grid", gap: "3px" }}>
            {i === 0 && <span style={labelStyle}>CSS Selector</span>}
            <input
              type="text"
              value={s.selector}
              onInput={e =>
                updateSelector(
                  i,
                  "selector",
                  (e.target as HTMLInputElement).value,
                )
              }
              placeholder=".price"
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: "3px" }}>
            {i === 0 && <span style={labelStyle}>Attribute</span>}
            <input
              type="text"
              value={s.attribute}
              onInput={e =>
                updateSelector(
                  i,
                  "attribute",
                  (e.target as HTMLInputElement).value,
                )
              }
              placeholder="href"
              style={inputStyle}
            />
          </label>
          <button
            onClick={() => removeSelector(i)}
            style={{
              padding: "6px 8px",
              background: "transparent",
              color: "var(--muted)",
              border: "1px solid var(--line)",
              cursor: "pointer",
              font: "12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={addSelector}
        style={{
          padding: "5px 10px",
          background: "transparent",
          color: "var(--muted)",
          border: "1px dashed var(--line)",
          cursor: "pointer",
          font: "11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
          alignSelf: "flex-start",
        }}
      >
        + Add selector
      </button>
    </div>
  );
}

function QuestionOptions({
  fmt,
  onChange,
}: {
  fmt: FormatObj;
  onChange: (patch: Partial<FormatObj>) => void;
}) {
  return (
    <div style={{ marginTop: "10px" }}>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={labelStyle}>Question prompt</span>
        <textarea
          value={(fmt.prompt as string) ?? ""}
          onInput={e =>
            onChange({ prompt: (e.target as HTMLTextAreaElement).value })
          }
          rows={2}
          placeholder="What is the main product price?"
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>
    </div>
  );
}

function ComplexCard({
  def,
  fmt,
  blocked,
  blockedBy,
  onToggle,
  onUpdate,
}: {
  def: ComplexFormatDef;
  fmt: FormatObj | undefined;
  blocked: boolean;
  blockedBy: string | null;
  onToggle: () => void;
  onUpdate: (patch: Partial<FormatObj>) => void;
}) {
  const active = !!fmt;
  return (
    <div style={cardStyle(active, blocked)}>
      <button
        onClick={blocked ? undefined : onToggle}
        title={blocked ? `Disabled: conflicts with ${blockedBy}` : undefined}
        style={toggleBtnStyle(active, blocked)}
      >
        <Dot active={active} />
        {def.label}
        {blocked && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: "10px",
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            conflicts with {blockedBy}
          </span>
        )}
      </button>

      {active && fmt && (
        <Fragment>
          {def.type === "screenshot" && (
            <ScreenshotOptions fmt={fmt} onChange={onUpdate} />
          )}
          {(def.type === "json" || def.type === "deterministicJson") && (
            <JsonOptions fmt={fmt} onChange={onUpdate} />
          )}
          {def.type === "changeTracking" && (
            <Fragment>
              {!isEnabled(fmt ? [fmt] : [], "markdown") && (
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "11px",
                    color: "#ffb196",
                    fontStyle: "italic",
                  }}
                >
                  ⚠ Also enable Markdown (required by changeTracking)
                </div>
              )}
              <ChangeTrackingOptions fmt={fmt} onChange={onUpdate} />
            </Fragment>
          )}
          {def.type === "attributes" && (
            <AttributesOptions fmt={fmt} onChange={onUpdate} />
          )}
          {def.type === "question" && (
            <QuestionOptions fmt={fmt} onChange={onUpdate} />
          )}
        </Fragment>
      )}
    </div>
  );
}

export function FormatsPanel({ formats, onChange }: Props) {
  const toggle_ = (type: string, defaultFmt: FormatObj) => {
    onChange(toggle(formats, type, defaultFmt));
  };

  const update_ = (type: string, patch: Partial<FormatObj>) => {
    onChange(updateFormat(formats, type, patch));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {/* Simple formats — 2-column chip grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "6px",
        }}
      >
        {SIMPLE_FORMATS.map(def => {
          const active = isEnabled(formats, def.type);
          return (
            <button
              key={def.type}
              onClick={() => toggle_(def.type, { type: def.type })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "7px 10px",
                background: active ? "rgba(255,100,0,0.06)" : "var(--field)",
                border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                cursor: "pointer",
                color: active ? "var(--ink)" : "var(--muted)",
                font: `${active ? 700 : 400} 12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`,
                textAlign: "left",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <Dot active={active} />
              {def.label}
            </button>
          );
        })}
      </div>

      {/* Complex formats — full-width cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {COMPLEX_FORMATS.map(def => {
          const fmt = getFormat(formats, def.type);
          const blockedBy = isBlocked(formats, def.type);
          const blocked = !!blockedBy;

          const defaultFmt: FormatObj =
            def.type === "screenshot"
              ? { type: "screenshot", fullPage: false, quality: 80 }
              : def.type === "json"
                ? {
                    type: "json",
                    schema: { type: "object", properties: {} },
                    prompt: "",
                  }
                : def.type === "deterministicJson"
                  ? {
                      type: "deterministicJson",
                      schema: { type: "object", properties: {} },
                    }
                  : def.type === "changeTracking"
                    ? { type: "changeTracking", mode: "json" }
                    : def.type === "attributes"
                      ? {
                          type: "attributes",
                          selectors: [{ selector: "", attribute: "href" }],
                        }
                      : def.type === "question"
                        ? { type: "question", prompt: "" }
                        : { type: def.type };

          return (
            <ComplexCard
              key={def.type}
              def={def}
              fmt={fmt}
              blocked={blocked}
              blockedBy={blockedBy}
              onToggle={() => toggle_(def.type, defaultFmt)}
              onUpdate={patch => update_(def.type, patch)}
            />
          );
        })}
      </div>

      {formats.length === 0 && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--muted)",
            fontStyle: "italic",
            padding: "4px 0",
          }}
        >
          No formats selected — API defaults to markdown
        </div>
      )}
    </div>
  );
}
