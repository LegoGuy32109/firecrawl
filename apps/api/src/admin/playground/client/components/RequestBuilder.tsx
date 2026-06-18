import { h, Fragment } from "preact";
import { useState } from "preact/hooks";
import {
  activeFeature,
  requestBody,
  inflight,
  response,
  apiKey,
} from "../signals";
import type { Feature } from "../signals";
import { JsonView } from "./JsonView";

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "textarea" | "checkbox";
};

const FEATURE_FIELDS: Record<Feature, FieldDef[]> = {
  scrape: [
    { key: "url", label: "URL *", type: "text" },
    { key: "waitFor", label: "Wait (ms)", type: "number" },
    { key: "mobile", label: "Mobile", type: "checkbox" },
  ],
  search: [
    { key: "query", label: "Query *", type: "text" },
    { key: "limit", label: "Limit", type: "number" },
    { key: "lang", label: "Lang", type: "text" },
    { key: "country", label: "Country", type: "text" },
  ],
  crawl: [
    { key: "url", label: "URL *", type: "text" },
    { key: "maxDepth", label: "Max Depth", type: "number" },
    { key: "limit", label: "Limit", type: "number" },
  ],
  map: [
    { key: "url", label: "URL *", type: "text" },
    { key: "search", label: "Search", type: "text" },
    { key: "limit", label: "Limit", type: "number" },
  ],
  extract: [
    { key: "urls", label: "URLs * (one per line)", type: "textarea" },
    { key: "prompt", label: "Prompt", type: "textarea" },
    { key: "schema", label: "Schema (JSON)", type: "textarea" },
  ],
  agent: [
    { key: "startUrl", label: "Start URL *", type: "text" },
    { key: "agentPrompt", label: "Agent Prompt", type: "textarea" },
    { key: "model", label: "Model", type: "text" },
  ],
};

const FEATURE_ENDPOINT: Record<Feature, string> = {
  scrape: "/v2/scrape",
  search: "/v2/search",
  crawl: "/v2/crawl",
  map: "/v2/map",
  extract: "/v2/extract",
  agent: "/v2/agent",
};

export function RequestBuilder() {
  const feature = activeFeature.value;
  const fields = FEATURE_FIELDS[feature];
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState("{}");
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const setField = (key: string, value: string) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  const buildBody = (): Record<string, unknown> => {
    if (rawMode) {
      try {
        return JSON.parse(rawJson);
      } catch {
        return {};
      }
    }
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const v = formValues[f.key] ?? "";
      if (!v && f.type !== "checkbox") continue;
      if (f.type === "number") {
        const n = Number(v);
        if (!isNaN(n) && v !== "") body[f.key] = n;
      } else if (f.type === "checkbox") {
        body[f.key] = formValues[f.key] === "true";
      } else if (f.key === "urls") {
        const lines = v
          .split("\n")
          .map(s => s.trim())
          .filter(Boolean);
        if (lines.length) body[f.key] = lines;
      } else if (f.key === "schema") {
        try {
          body[f.key] = JSON.parse(v);
        } catch {
          /* skip */
        }
      } else {
        body[f.key] = v;
      }
    }
    return body;
  };

  const send = async () => {
    const body = buildBody();
    requestBody.value = body;
    inflight.value = true;
    response.value = null;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey.value) headers["Authorization"] = `Bearer ${apiKey.value}`;
      const res = await fetch(FEATURE_ENDPOINT[feature], {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      response.value = { status: res.status, body: data };
    } catch (err: unknown) {
      response.value = {
        status: 0,
        body: { error: err instanceof Error ? err.message : String(err) },
      };
    } finally {
      inflight.value = false;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            color: "var(--muted)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {feature} — {FEATURE_ENDPOINT[feature]}
        </span>
        <button
          onClick={() => setRawMode(m => !m)}
          style={{
            padding: "4px 10px",
            background: "transparent",
            color: "var(--muted)",
            border: "1px solid var(--line)",
            cursor: "pointer",
            font: "11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
          }}
        >
          {rawMode ? "Form" : "Raw JSON"}
        </button>
      </div>

      {rawMode ? (
        <Fragment>
          <textarea
            value={rawJson}
            onInput={e => setRawJson((e.target as HTMLTextAreaElement).value)}
            style={{
              width: "100%",
              height: "160px",
              padding: "10px",
              background: "var(--field)",
              border: "1px solid var(--line)",
              color: "var(--ink)",
              font: "13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
              resize: "vertical",
            }}
          />
          {(() => {
            try {
              const parsed = JSON.parse(rawJson);
              return <JsonView value={parsed} collapsed={false} />;
            } catch {
              return null;
            }
          })()}
        </Fragment>
      ) : (
        <Fragment>
          {fields.map(f => (
            <label
              key={f.key}
              style={{
                display: "grid",
                gap: "6px",
                color: "var(--muted)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {f.label}
              {f.type === "textarea" ? (
                <textarea
                  value={formValues[f.key] ?? ""}
                  onInput={e =>
                    setField(f.key, (e.target as HTMLTextAreaElement).value)
                  }
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 11px",
                    background: "var(--field)",
                    border: "1px solid var(--line)",
                    color: "var(--ink)",
                    font: "13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
                    resize: "vertical",
                  }}
                />
              ) : f.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={formValues[f.key] === "true"}
                  onChange={e =>
                    setField(
                      f.key,
                      (e.target as HTMLInputElement).checked ? "true" : "false",
                    )
                  }
                  style={{ width: "18px", height: "18px" }}
                />
              ) : (
                <input
                  type={f.type === "number" ? "number" : "text"}
                  value={formValues[f.key] ?? ""}
                  onInput={e =>
                    setField(f.key, (e.target as HTMLInputElement).value)
                  }
                  style={{
                    width: "100%",
                    padding: "10px 11px",
                    background: "var(--field)",
                    border: "1px solid var(--line)",
                    color: "var(--ink)",
                    font: "13px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
                  }}
                />
              )}
            </label>
          ))}
        </Fragment>
      )}

      <button
        onClick={send}
        disabled={inflight.value}
        style={{
          padding: "10px 20px",
          background: inflight.value ? "var(--muted)" : "var(--accent)",
          color: "#fff",
          border: "none",
          cursor: inflight.value ? "not-allowed" : "pointer",
          font: "700 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
          letterSpacing: "0.04em",
          alignSelf: "flex-start",
        }}
      >
        {inflight.value ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
