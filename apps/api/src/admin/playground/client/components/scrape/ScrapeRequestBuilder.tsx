import { h, Fragment } from "preact";
import { useState } from "preact/hooks";
import { inflight, historyEntries, requestBody, apiKey } from "../../signals";
import { FormatsPanel } from "./FormatsPanel";
import { ActionsBuilder, type Action } from "./ActionsBuilder";
import {
  createPendingEntry,
  deriveTarget,
  extractCreditsUsed,
  finalizeHistoryEntry,
  insertPendingEntry,
  makeEntryId,
  normalizeWarnings,
} from "../../history";

type FormatObj = { type: string; [k: string]: unknown };
type KVPair = { key: string; value: string };
type LocationObj = { country?: string; languages?: string[] };

const COUNTRIES = [
  "US",
  "GB",
  "DE",
  "FR",
  "CA",
  "AU",
  "JP",
  "IN",
  "BR",
  "MX",
  "IT",
  "ES",
  "NL",
  "SE",
  "NO",
  "DK",
  "FI",
  "PL",
  "PT",
  "RU",
  "KR",
  "CN",
  "SG",
  "HK",
  "TW",
  "AE",
  "SA",
  "ZA",
  "NG",
  "KE",
];

const sectionLabel = {
  color: "var(--muted)",
  fontSize: "11px",
  fontWeight: 700 as const,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

const fieldLabel = {
  ...sectionLabel,
  marginBottom: "5px",
  display: "block" as const,
};

const inputStyle = {
  width: "100%",
  padding: "9px 11px",
  background: "var(--field)",
  border: "1px solid var(--line)",
  color: "var(--ink)",
  font: "13px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
};

const sectionStyle = {
  borderTop: "1px solid var(--line)",
  paddingTop: "14px",
  display: "flex" as const,
  flexDirection: "column" as const,
  gap: "12px",
};

const toggleRow = {
  display: "flex" as const,
  alignItems: "center" as const,
  gap: "8px",
  cursor: "pointer" as const,
};

// ── helpers to read/write typed fields from the shared signal ──────────────

function getFormats(): FormatObj[] {
  const f = requestBody.value.formats;
  return Array.isArray(f) ? (f as FormatObj[]) : [];
}

function getActions(): Action[] {
  const a = requestBody.value.actions;
  return Array.isArray(a) ? (a as Action[]) : [];
}

function getLocation(): LocationObj {
  const l = requestBody.value.location;
  return l && typeof l === "object" ? (l as LocationObj) : {};
}

function getHeaders(): KVPair[] {
  const h = requestBody.value.headers;
  if (!h || typeof h !== "object") return [];
  return Object.entries(h as Record<string, string>).map(([key, value]) => ({
    key,
    value,
  }));
}

function kvToObj(pairs: KVPair[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (const { key, value } of pairs) {
    if (key.trim()) obj[key.trim()] = value;
  }
  return obj;
}

function set(key: string, value: unknown) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === false
  ) {
    const { [key]: _, ...rest } = requestBody.value;
    requestBody.value = rest;
  } else {
    requestBody.value = { ...requestBody.value, [key]: value };
  }
}

// ── KV editor for headers ──────────────────────────────────────────────────

function HeadersEditor() {
  const pairs = getHeaders();

  const update = (i: number, field: keyof KVPair, val: string) => {
    const next = pairs.map((p, idx) =>
      idx === i ? { ...p, [field]: val } : p,
    );
    set("headers", kvToObj(next));
  };

  const add = () => set("headers", kvToObj([...pairs, { key: "", value: "" }]));

  const remove = (i: number) =>
    set("headers", kvToObj(pairs.filter((_, idx) => idx !== i)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {pairs.map((p, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: "6px",
          }}
        >
          <input
            type="text"
            value={p.key}
            onInput={e =>
              update(i, "key", (e.target as HTMLInputElement).value)
            }
            placeholder="Header-Name"
            style={inputStyle}
          />
          <input
            type="text"
            value={p.value}
            onInput={e =>
              update(i, "value", (e.target as HTMLInputElement).value)
            }
            placeholder="value"
            style={inputStyle}
          />
          <button
            onClick={() => remove(i)}
            style={{
              padding: "0 8px",
              background: "transparent",
              color: "var(--muted)",
              border: "1px solid var(--line)",
              cursor: "pointer",
              font: "11px/1 monospace",
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={add}
        style={{
          padding: "6px 10px",
          background: "transparent",
          color: "var(--muted)",
          border: "1px dashed var(--line)",
          cursor: "pointer",
          font: "11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
          alignSelf: "flex-start",
        }}
      >
        + Add header
      </button>
    </div>
  );
}

// ── Toggle widget ──────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label style={toggleRow}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange((e.target as HTMLInputElement).checked)}
        style={{ width: "15px", height: "15px", cursor: "pointer" }}
      />
      <span style={{ ...sectionLabel, textTransform: "none" }}>{label}</span>
    </label>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────

function Section({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  children: h.JSX.Element | h.JSX.Element[];
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={sectionStyle}>
      <button
        onClick={collapsible ? () => setOpen(o => !o) : undefined}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: collapsible ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span style={sectionLabel}>{title}</span>
        {collapsible && (
          <span style={{ color: "var(--muted)", fontSize: "10px" }}>
            {open ? "▲" : "▼"}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ScrapeRequestBuilder() {
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState(() =>
    JSON.stringify(requestBody.value, null, 2),
  );
  const [rawError, setRawError] = useState<string | null>(null);
  const rb = requestBody.value;

  const openRawMode = () => {
    setRawJson(JSON.stringify(requestBody.value, null, 2));
    setRawError(null);
    setRawMode(true);
  };

  const updateRawJson = (text: string) => {
    setRawJson(text);
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setRawError("Request body must be a JSON object.");
        return;
      }
      requestBody.value = parsed as Record<string, unknown>;
      setRawError(null);
    } catch (error) {
      setRawError(error instanceof Error ? error.message : String(error));
    }
  };

  const send = async () => {
    inflight.value = true;
    const startedAt = Date.now();
    let entryId: string | null = null;
    try {
      let body = requestBody.value;
      if (rawMode) {
        const parsed = JSON.parse(rawJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Request body must be a JSON object.");
        }
        body = parsed as Record<string, unknown>;
        requestBody.value = body;
        setRawError(null);
      }

      entryId = makeEntryId();
      const endpoint = "/v2/scrape";
      const pending = createPendingEntry({
        id: entryId,
        feature: "scrape",
        method: "POST",
        endpoint,
        requestBody: body,
        target: deriveTarget("scrape", body, endpoint),
        startedAt,
      });
      historyEntries.value = insertPendingEntry(historyEntries.value, pending);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey.value) headers["Authorization"] = `Bearer ${apiKey.value}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        data = {
          error: text.slice(0, 2048),
          success: false,
        };
      }
      const warnings = normalizeWarnings(data);
      const completedAt = Date.now();
      historyEntries.value = finalizeHistoryEntry(
        historyEntries.value,
        entryId,
        {
          status: res.status,
          body: data,
          completedAt,
          durationMs: completedAt - startedAt,
          creditsUsed: extractCreditsUsed(data) ?? undefined,
          warningCount: warnings.length,
          warnings,
          legacyWarning:
            typeof data.warning === "string" ? data.warning : undefined,
          code: typeof data.code === "string" ? data.code : undefined,
          errorMessage: res.ok
            ? undefined
            : typeof data.error === "string"
              ? data.error
              : text.slice(0, 2048),
        },
      );
    } catch (err: unknown) {
      if (!entryId) {
        throw err;
      }
      const completedAt = Date.now();
      const errorMessage = err instanceof Error ? err.message : String(err);
      historyEntries.value = finalizeHistoryEntry(
        historyEntries.value,
        entryId,
        {
          status: 0,
          errorMessage,
          completedAt,
          durationMs: completedAt - startedAt,
          body: { error: errorMessage },
        },
      );
    } finally {
      inflight.value = false;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {/* Mode toggle */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "14px",
        }}
      >
        <span style={sectionLabel}>scrape — /v2/scrape</span>
        <button
          onClick={() => (rawMode ? setRawMode(false) : openRawMode())}
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
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <textarea
            value={rawJson}
            spellcheck={false}
            onInput={e =>
              updateRawJson((e.target as HTMLTextAreaElement).value)
            }
            style={{
              width: "100%",
              minHeight: "360px",
              padding: "10px",
              background: "var(--field)",
              border: `1px solid ${rawError ? "#8a3a2a" : "var(--line)"}`,
              color: "var(--ink)",
              font: "12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
              resize: "vertical",
              tabSize: 2,
            }}
          />
          {rawError && (
            <div
              style={{
                color: "#ffb196",
                fontSize: "12px",
                border: "1px solid #573121",
                background: "var(--accent-soft)",
                padding: "8px 10px",
              }}
            >
              {rawError}
            </div>
          )}
          <div
            style={{
              color: "var(--muted)",
              fontSize: "11px",
              fontFamily:
                "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
            }}
          >
            Valid JSON updates the request body immediately.
          </div>
        </div>
      ) : (
        <Fragment>
          {/* Basic */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            <label style={{ display: "grid", gap: "5px" }}>
              <span style={fieldLabel}>URL *</span>
              <input
                type="text"
                value={(rb.url as string) ?? ""}
                onInput={e => set("url", (e.target as HTMLInputElement).value)}
                placeholder="https://example.com"
                style={inputStyle}
              />
            </label>

            {/* Formats */}
            <Section title="Formats">
              <FormatsPanel
                formats={getFormats()}
                onChange={formats =>
                  (requestBody.value = { ...requestBody.value, formats })
                }
              />
            </Section>

            {/* Options */}
            <Section title="Options">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <label style={{ display: "grid", gap: "5px" }}>
                  <span style={fieldLabel}>Wait (ms)</span>
                  <input
                    type="number"
                    min={0}
                    max={60000}
                    value={(rb.waitFor as number) ?? ""}
                    onInput={e => {
                      const v = (e.target as HTMLInputElement).value;
                      set("waitFor", v ? Number(v) : undefined);
                    }}
                    placeholder="0"
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: "grid", gap: "5px" }}>
                  <span style={fieldLabel}>Timeout (ms)</span>
                  <input
                    type="number"
                    min={1000}
                    value={(rb.timeout as number) ?? ""}
                    onInput={e => {
                      const v = (e.target as HTMLInputElement).value;
                      set("timeout", v ? Number(v) : undefined);
                    }}
                    placeholder="30000"
                    style={inputStyle}
                  />
                </label>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap" as const,
                  gap: "16px",
                }}
              >
                <Toggle
                  checked={(rb.onlyMainContent as boolean) !== false}
                  onChange={v => set("onlyMainContent", v ? true : false)}
                  label="Only main content"
                />
                <Toggle
                  checked={!!(rb.mobile as boolean)}
                  onChange={v => set("mobile", v || undefined)}
                  label="Mobile"
                />
                <Toggle
                  checked={!!(rb.fastMode as boolean)}
                  onChange={v => set("fastMode", v || undefined)}
                  label="Fast mode"
                />
              </div>
            </Section>

            {/* Advanced */}
            <Section title="Advanced" collapsible defaultOpen={false}>
              {/* Location */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <span style={sectionLabel}>Location</span>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "8px",
                  }}
                >
                  <label style={{ display: "grid", gap: "4px" }}>
                    <span style={fieldLabel}>Country</span>
                    <select
                      value={getLocation().country ?? ""}
                      onChange={e => {
                        const v = (e.target as HTMLSelectElement).value;
                        const loc = getLocation();
                        set("location", v ? { ...loc, country: v } : undefined);
                      }}
                      style={inputStyle}
                    >
                      <option value="">— none —</option>
                      <option value="us-generic">us-generic</option>
                      <option value="us-whitelist">us-whitelist</option>
                      {COUNTRIES.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: "4px" }}>
                    <span style={fieldLabel}>Languages (comma-sep)</span>
                    <input
                      type="text"
                      value={(getLocation().languages ?? []).join(", ")}
                      onInput={e => {
                        const raw = (e.target as HTMLInputElement).value;
                        const langs = raw
                          .split(",")
                          .map(s => s.trim())
                          .filter(Boolean);
                        const loc = getLocation();
                        set(
                          "location",
                          loc.country
                            ? {
                                ...loc,
                                languages: langs.length ? langs : undefined,
                              }
                            : undefined,
                        );
                      }}
                      placeholder="en, fr"
                      style={inputStyle}
                    />
                  </label>
                </div>
              </div>

              {/* Headers */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <span style={sectionLabel}>Request Headers</span>
                <HeadersEditor />
              </div>

              {/* Actions */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "6px" }}
              >
                <span style={sectionLabel}>Browser Actions</span>
                <ActionsBuilder
                  actions={getActions()}
                  onChange={actions =>
                    set("actions", actions.length ? actions : undefined)
                  }
                />
              </div>

              {/* Misc toggles */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap" as const,
                  gap: "16px",
                }}
              >
                <Toggle
                  checked={!!(rb.skipTlsVerification as boolean)}
                  onChange={v => set("skipTlsVerification", v || undefined)}
                  label="Skip TLS verification"
                />
              </div>
            </Section>
          </div>
        </Fragment>
      )}

      <button
        onClick={send}
        disabled={inflight.value}
        style={{
          marginTop: "16px",
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
