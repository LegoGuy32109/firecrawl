import { h, Fragment } from "preact";

type ActionType =
  | "wait"
  | "click"
  | "scroll"
  | "write"
  | "press"
  | "screenshot"
  | "scrape"
  | "executeJavascript"
  | "pdf";

export type Action = {
  type: ActionType;
  selector?: string;
  milliseconds?: number;
  all?: boolean;
  direction?: "up" | "down";
  text?: string;
  key?: string;
  script?: string;
  fullPage?: boolean;
  quality?: number;
};

type Props = {
  actions: Action[];
  onChange: (actions: Action[]) => void;
};

const ACTION_TYPES: ActionType[] = [
  "wait",
  "click",
  "scroll",
  "write",
  "press",
  "screenshot",
  "scrape",
  "executeJavascript",
  "pdf",
];

const inputStyle = {
  padding: "5px 8px",
  background: "var(--field)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  font: "12px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
  width: "100%",
};

const labelStyle = {
  color: "var(--muted)",
  fontSize: "10px",
  fontWeight: 700 as const,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
};

function ActionRow({
  action,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  action: Action;
  index: number;
  total: number;
  onUpdate: (patch: Partial<Action>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: "8px",
        alignItems: "start",
        padding: "8px 10px",
        background: "var(--field)",
        border: "1px solid var(--line)",
      }}
    >
      {/* Reorder + type */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => onMove(-1)}
          disabled={index === 0}
          title="Move up"
          style={{
            padding: "2px 5px",
            background: "transparent",
            color: index === 0 ? "var(--line)" : "var(--muted)",
            border: "1px solid var(--line)",
            cursor: index === 0 ? "default" : "pointer",
            font: "10px/1 monospace",
          }}
        >
          ▲
        </button>
        <span
          style={{
            color: "var(--muted)",
            fontSize: "10px",
            fontWeight: 700,
          }}
        >
          {index + 1}
        </span>
        <button
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          title="Move down"
          style={{
            padding: "2px 5px",
            background: "transparent",
            color: index === total - 1 ? "var(--line)" : "var(--muted)",
            border: "1px solid var(--line)",
            cursor: index === total - 1 ? "default" : "pointer",
            font: "10px/1 monospace",
          }}
        >
          ▼
        </button>
      </div>

      {/* Fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label style={{ display: "grid", gap: "3px" }}>
          <span style={labelStyle}>Type</span>
          <select
            value={action.type}
            onChange={e =>
              onUpdate({
                type: (e.target as HTMLSelectElement).value as ActionType,
              })
            }
            style={inputStyle}
          >
            {ACTION_TYPES.map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        {/* wait */}
        {action.type === "wait" && (
          <Fragment>
            <label style={{ display: "grid", gap: "3px" }}>
              <span style={labelStyle}>Milliseconds</span>
              <input
                type="number"
                min={0}
                value={action.milliseconds ?? 1000}
                onInput={e =>
                  onUpdate({
                    milliseconds: Number((e.target as HTMLInputElement).value),
                    selector: undefined,
                  })
                }
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: "3px" }}>
              <span style={labelStyle}>Or wait for selector</span>
              <input
                type="text"
                value={action.selector ?? ""}
                onInput={e =>
                  onUpdate({
                    selector: (e.target as HTMLInputElement).value || undefined,
                    milliseconds: undefined,
                  })
                }
                placeholder=".loaded"
                style={inputStyle}
              />
            </label>
          </Fragment>
        )}

        {/* click */}
        {action.type === "click" && (
          <Fragment>
            <label style={{ display: "grid", gap: "3px" }}>
              <span style={labelStyle}>Selector</span>
              <input
                type="text"
                value={action.selector ?? ""}
                onInput={e =>
                  onUpdate({ selector: (e.target as HTMLInputElement).value })
                }
                placeholder="#button"
                style={inputStyle}
              />
            </label>
            <label
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <input
                type="checkbox"
                checked={!!action.all}
                onChange={e =>
                  onUpdate({ all: (e.target as HTMLInputElement).checked })
                }
                style={{ width: "14px", height: "14px" }}
              />
              <span style={labelStyle}>Click all matching</span>
            </label>
          </Fragment>
        )}

        {/* scroll */}
        {action.type === "scroll" && (
          <Fragment>
            <label style={{ display: "grid", gap: "3px" }}>
              <span style={labelStyle}>Direction</span>
              <select
                value={action.direction ?? "down"}
                onChange={e =>
                  onUpdate({
                    direction: (e.target as HTMLSelectElement).value as
                      | "up"
                      | "down",
                  })
                }
                style={inputStyle}
              >
                <option value="down">down</option>
                <option value="up">up</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: "3px" }}>
              <span style={labelStyle}>Selector (optional)</span>
              <input
                type="text"
                value={action.selector ?? ""}
                onInput={e =>
                  onUpdate({
                    selector: (e.target as HTMLInputElement).value || undefined,
                  })
                }
                placeholder=".content"
                style={inputStyle}
              />
            </label>
          </Fragment>
        )}

        {/* write */}
        {action.type === "write" && (
          <label style={{ display: "grid", gap: "3px" }}>
            <span style={labelStyle}>Text to type</span>
            <input
              type="text"
              value={action.text ?? ""}
              onInput={e =>
                onUpdate({ text: (e.target as HTMLInputElement).value })
              }
              placeholder="hello world"
              style={inputStyle}
            />
          </label>
        )}

        {/* press */}
        {action.type === "press" && (
          <label style={{ display: "grid", gap: "3px" }}>
            <span style={labelStyle}>Key</span>
            <input
              type="text"
              value={action.key ?? ""}
              onInput={e =>
                onUpdate({ key: (e.target as HTMLInputElement).value })
              }
              placeholder="Enter"
              style={inputStyle}
            />
          </label>
        )}

        {/* screenshot */}
        {action.type === "screenshot" && (
          <Fragment>
            <label
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <input
                type="checkbox"
                checked={!!action.fullPage}
                onChange={e =>
                  onUpdate({ fullPage: (e.target as HTMLInputElement).checked })
                }
                style={{ width: "14px", height: "14px" }}
              />
              <span style={labelStyle}>Full page</span>
            </label>
            <label style={{ display: "grid", gap: "3px" }}>
              <span style={labelStyle}>Quality (1–100)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={action.quality ?? 80}
                onInput={e =>
                  onUpdate({
                    quality: Number((e.target as HTMLInputElement).value),
                  })
                }
                style={inputStyle}
              />
            </label>
          </Fragment>
        )}

        {/* executeJavascript */}
        {action.type === "executeJavascript" && (
          <label style={{ display: "grid", gap: "3px" }}>
            <span style={labelStyle}>Script</span>
            <textarea
              value={action.script ?? ""}
              onInput={e =>
                onUpdate({ script: (e.target as HTMLTextAreaElement).value })
              }
              rows={3}
              placeholder="return document.title;"
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily:
                  "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
              }}
            />
          </label>
        )}

        {/* scrape and pdf — no options */}
        {(action.type === "scrape" || action.type === "pdf") && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--muted)",
              fontStyle: "italic",
            }}
          >
            No options required
          </div>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        title="Remove action"
        style={{
          padding: "4px 7px",
          background: "transparent",
          color: "var(--muted)",
          border: "1px solid var(--line)",
          cursor: "pointer",
          font: "11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
          alignSelf: "start",
          marginTop: "18px",
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function ActionsBuilder({ actions, onChange }: Props) {
  const update = (i: number, patch: Partial<Action>) => {
    onChange(actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  };

  const remove = (i: number) => {
    onChange(actions.filter((_, idx) => idx !== i));
  };

  const move = (i: number, dir: -1 | 1) => {
    const next = [...actions];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const add = () => {
    onChange([...actions, { type: "wait", milliseconds: 1000 }]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {actions.length === 0 && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--muted)",
            fontStyle: "italic",
            padding: "4px 0",
          }}
        >
          No actions — page loads and scrapes immediately
        </div>
      )}

      {actions.map((a, i) => (
        <ActionRow
          key={i}
          action={a}
          index={i}
          total={actions.length}
          onUpdate={patch => update(i, patch)}
          onRemove={() => remove(i)}
          onMove={dir => move(i, dir)}
        />
      ))}

      {actions.length >= 50 && (
        <div
          style={{ fontSize: "11px", color: "#ffb196", fontStyle: "italic" }}
        >
          Max 50 actions reached
        </div>
      )}

      {actions.length < 50 && (
        <button
          onClick={add}
          style={{
            padding: "7px 12px",
            background: "transparent",
            color: "var(--muted)",
            border: "1px dashed var(--line)",
            cursor: "pointer",
            font: "12px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
            alignSelf: "flex-start",
          }}
        >
          + Add action
        </button>
      )}
    </div>
  );
}
