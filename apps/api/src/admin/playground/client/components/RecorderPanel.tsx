import { actions, recordingUrl, type FirecrawlAction } from "../signals";
import { Button } from "./ui/Button";

function buildCurlSnippet(acts: FirecrawlAction[], url: string): string {
  const body = JSON.stringify({ url, actions: acts }, null, 2);
  return `curl -X POST https://api.firecrawl.dev/v1/scrape \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${body.replace(/'/g, "'\\''")}'`;
}

function buildSdkSnippet(acts: FirecrawlAction[], url: string): string {
  const actionsJson = JSON.stringify(acts, null, 4)
    .split("\n")
    .map((l, i) => (i === 0 ? l : "    " + l))
    .join("\n");
  return `import FirecrawlApp from "@mendable/firecrawl-js";

const app = new FirecrawlApp({ apiKey: "YOUR_API_KEY" });

const result = await app.scrapeUrl("${url}", {
    actions: ${actionsJson},
});

console.log(result);`;
}

function ActionRow({
  index,
  action,
}: {
  index: number;
  action: FirecrawlAction;
}) {
  function update(patch: Partial<FirecrawlAction>) {
    const next = [...actions.value];
    next[index] = { ...action, ...patch };
    actions.value = next;
  }

  function remove() {
    const next = [...actions.value];
    next.splice(index, 1);
    actions.value = next;
  }

  function moveUp() {
    if (index === 0) return;
    const next = [...actions.value];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    actions.value = next;
  }

  function moveDown() {
    if (index >= actions.value.length - 1) return;
    const next = [...actions.value];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    actions.value = next;
  }

  const rowStyle = {
    display: "grid",
    gridTemplateColumns: "90px 1fr 1fr auto",
    gap: "4px",
    alignItems: "center",
    padding: "4px 0",
    borderBottom: "1px solid var(--panel)",
    fontSize: "12px",
  };

  return (
    <div style={rowStyle}>
      <select
        value={action.type}
        onChange={e =>
          update({
            type: (e.target as HTMLSelectElement)
              .value as FirecrawlAction["type"],
          })
        }
        className="playground-select playground-select--tight"
      >
        <option value="click">click</option>
        <option value="write">write</option>
        <option value="press">press</option>
        <option value="scroll">scroll</option>
        <option value="wait">wait</option>
      </select>

      {(action.type === "click" || action.type === "write") && (
        <input
          placeholder="selector"
          value={action.selector ?? ""}
          onInput={e =>
            update({ selector: (e.target as HTMLInputElement).value })
          }
          className="playground-input playground-input--tight"
        />
      )}

      {action.type === "write" && (
        <input
          placeholder="text"
          value={action.text ?? ""}
          onInput={e => update({ text: (e.target as HTMLInputElement).value })}
          className="playground-input playground-input--tight"
        />
      )}

      {action.type === "press" && (
        <input
          placeholder="key (e.g. Enter)"
          value={action.key ?? ""}
          onInput={e => update({ key: (e.target as HTMLInputElement).value })}
          className="playground-input playground-input--tight"
          style={{ gridColumn: "2 / 4" }}
        />
      )}

      {action.type === "scroll" && (
        <>
          <select
            value={action.direction ?? "down"}
            onChange={e =>
              update({
                direction: (e.target as HTMLSelectElement).value as
                  | "up"
                  | "down",
              })
            }
            className="playground-select playground-select--tight"
          >
            <option value="down">down</option>
            <option value="up">up</option>
          </select>
          <input
            type="number"
            placeholder="amount"
            value={action.amount ?? ""}
            onInput={e =>
              update({ amount: Number((e.target as HTMLInputElement).value) })
            }
            className="playground-input playground-input--tight"
          />
        </>
      )}

      {action.type === "wait" && (
        <input
          type="number"
          placeholder="ms"
          value={action.milliseconds ?? ""}
          onInput={e =>
            update({
              milliseconds: Number((e.target as HTMLInputElement).value),
            })
          }
          className="playground-input playground-input--tight"
          style={{ gridColumn: "2 / 4" }}
        />
      )}

      <div className="playground-row">
        <Button type="button" title="Move up" onClick={moveUp} size="xs">
          ↑
        </Button>
        <Button type="button" title="Move down" onClick={moveDown} size="xs">
          ↓
        </Button>
        <Button
          type="button"
          title="Delete"
          onClick={remove}
          size="xs"
          variant="danger"
        >
          ✕
        </Button>
      </div>
    </div>
  );
}

export function RecorderPanel() {
  const acts = actions.value;
  const recUrl = recordingUrl.value;

  const targetUrl =
    (document.querySelector("[data-field='url']") as HTMLInputElement | null)
      ?.value ?? "https://example.com";

  function copyJson() {
    navigator.clipboard.writeText(JSON.stringify(acts, null, 2));
  }

  function copyCurl() {
    navigator.clipboard.writeText(buildCurlSnippet(acts, targetUrl));
  }

  function copySdk() {
    navigator.clipboard.writeText(buildSdkSnippet(acts, targetUrl));
  }

  return (
    <div className="playground-stack" style={{ fontSize: "12px" }}>
      <div className="playground-row playground-row--between">
        <span style={{ fontWeight: "bold" }}>
          Recorded actions ({acts.length})
        </span>
        <div className="playground-row">
          <Button type="button" onClick={copyJson} disabled={acts.length === 0}>
            Copy JSON
          </Button>
          <Button type="button" onClick={copyCurl} disabled={acts.length === 0}>
            Copy curl
          </Button>
          <Button type="button" onClick={copySdk} disabled={acts.length === 0}>
            Copy SDK
          </Button>
        </div>
      </div>

      {acts.length === 0 && (
        <div
          className="playground-muted"
          style={{ opacity: 0.5, padding: "8px 0" }}
        >
          No actions recorded yet.
        </div>
      )}

      {acts.map((action, i) => (
        <ActionRow key={i} index={i} action={action} />
      ))}

      {recUrl && (
        <div style={{ marginTop: "12px" }}>
          <a href={recUrl} download className="playground-link">
            Download recording (.webm)
          </a>
        </div>
      )}
    </div>
  );
}
