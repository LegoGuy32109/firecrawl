import { h, Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  activeInteractJobId,
  apiKey,
  clearLiveSession,
  inflight,
  liveViewUrl,
  historyEntries,
  requestBody,
  sessionId,
} from "../signals";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { JsonView } from "./JsonView";
import {
  createPendingEntry,
  deriveTarget,
  extractCreditsUsed,
  finalizeHistoryEntry,
  insertPendingEntry,
  makeEntryId,
  normalizeWarnings,
} from "../history";
import { extractInteractResponseContext } from "../lib/interact-response";
import {
  buildInteractRequestBody,
  getInteractRequestValidationError,
} from "../lib/interact-request";
import { INTERACT_LANGUAGES } from "../lib/interact-types";

function buildEndpoint(jobId: string): string {
  return `/v2/scrape/${encodeURIComponent(jobId)}/interact`;
}

type PlaygroundScrapeStatusLabel =
  | "Live session"
  | "Destroyed"
  | "No session"
  | "Replay unavailable";

type PlaygroundScrape = {
  id: string;
  url: string | null;
  createdAt: string;
  isSuccessful: boolean;
  error: string | null;
  actionsCount: number;
  waitForMs: number;
  creditsUsed: number;
  replayAvailable: boolean;
  replayUnavailableReason?: string;
  statusLabel: PlaygroundScrapeStatusLabel;
  session: {
    id: string;
    browserId: string;
    status: "active" | "destroyed" | "error";
    createdAt: string;
    updatedAt: string;
    creditsUsed: number | null;
    liveViewUrl?: string;
  } | null;
};

function getPlaygroundScrapesEndpoint(): string {
  if (typeof window === "undefined") return "/admin/playground/scrapes";
  const match = window.location.pathname.match(/^(.*\/playground)(?:\/.*)?$/);
  return `${match?.[1] ?? window.location.pathname.replace(/\/$/, "")}/scrapes`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatAge(value: string): string {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return "unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function truncateMiddle(value: string, max = 24): string {
  if (value.length <= max) return value;
  const side = Math.floor((max - 1) / 2);
  return `${value.slice(0, side)}…${value.slice(-side)}`;
}

function getStatusChipClass(label: PlaygroundScrapeStatusLabel): string {
  if (label === "Live session") return "playground-chip--success";
  if (label === "Replay unavailable") return "playground-chip--danger";
  if (label === "Destroyed") return "playground-chip--warning";
  return "playground-chip--muted";
}

export function InteractRequestBuilder() {
  const body = requestBody.value;
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState("{}");
  const [stopError, setStopError] = useState<string | null>(null);
  const [scrapes, setScrapes] = useState<PlaygroundScrape[]>([]);
  const [scrapesLoading, setScrapesLoading] = useState(false);
  const [scrapesError, setScrapesError] = useState<string | null>(null);
  const selectedScrape = scrapes.find(
    scrape => scrape.id === String(body.jobId ?? ""),
  );
  const hasActiveSession = selectedScrape?.session?.status === "active";
  const replayBlocked =
    !!selectedScrape && !hasActiveSession && !selectedScrape.replayAvailable;
  const validationError = getInteractRequestValidationError(
    body,
    rawMode,
    rawJson,
  );
  const canRun = !inflight.value && !validationError && !replayBlocked;

  const loadScrapes = async () => {
    setScrapesLoading(true);
    setScrapesError(null);
    try {
      const headers: Record<string, string> = {};
      if (apiKey.value) headers.Authorization = `Bearer ${apiKey.value}`;
      const res = await fetch(getPlaygroundScrapesEndpoint(), { headers });
      const data = (await res.json()) as {
        success?: boolean;
        scrapes?: PlaygroundScrape[];
        error?: string;
      };
      if (!res.ok || data.success === false) {
        throw new Error(data.error ?? `GET scrapes ${res.status}`);
      }
      setScrapes(Array.isArray(data.scrapes) ? data.scrapes : []);
    } catch (err) {
      setScrapesError(err instanceof Error ? err.message : String(err));
    } finally {
      setScrapesLoading(false);
    }
  };

  useEffect(() => {
    void loadScrapes();
  }, [apiKey.value]);

  const send = async () => {
    if (validationError || replayBlocked) return;
    const nextBody = buildInteractRequestBody(body, rawMode, rawJson);
    if (!nextBody) return;
    requestBody.value = nextBody;
    inflight.value = true;
    clearLiveSession();

    const startedAt = Date.now();
    const id = makeEntryId();
    const jobId =
      typeof nextBody.jobId === "string" ? nextBody.jobId : "interact";
    activeInteractJobId.value = jobId; // lock in before fetch so Stop hits the right endpoint
    const endpoint = buildEndpoint(jobId);

    const pending = createPendingEntry({
      id,
      feature: "interact",
      method: "POST",
      endpoint,
      requestBody: nextBody,
      target: deriveTarget("interact", nextBody, endpoint),
      startedAt,
    });
    historyEntries.value = insertPendingEntry(historyEntries.value, pending);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey.value) headers["Authorization"] = `Bearer ${apiKey.value}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(nextBody),
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
      const responseContext = extractInteractResponseContext(data);
      sessionId.value = responseContext.sessionId;
      liveViewUrl.value = responseContext.liveViewUrl;
      if (!responseContext.sessionId) activeInteractJobId.value = null;
      void loadScrapes();

      const warnings = normalizeWarnings(data);
      const creditsUsed = extractCreditsUsed(data);
      const completedAt = Date.now();
      historyEntries.value = finalizeHistoryEntry(historyEntries.value, id, {
        status: res.status,
        body: data,
        completedAt,
        durationMs: completedAt - startedAt,
        creditsUsed: creditsUsed ?? undefined,
        warningCount: warnings.length,
        warnings,
        legacyWarning:
          typeof data.warning === "string" ? data.warning : undefined,
        code: typeof data.code === "string" ? data.code : undefined,
        errorMessage: res.ok
          ? undefined
          : typeof data.error === "string"
            ? data.error
            : undefined,
      });
    } catch (err: unknown) {
      activeInteractJobId.value = null;
      const completedAt = Date.now();
      historyEntries.value = finalizeHistoryEntry(historyEntries.value, id, {
        status: 0,
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt,
        durationMs: completedAt - startedAt,
        body: {
          error: err instanceof Error ? err.message : String(err),
        },
      });
    } finally {
      inflight.value = false;
    }
  };

  const stop = async () => {
    const jobId = activeInteractJobId.value;
    if (!jobId) return;
    try {
      const res = await fetch(
        `/v2/scrape/${encodeURIComponent(jobId)}/interact`,
        {
          method: "DELETE",
          headers: apiKey.value
            ? { Authorization: `Bearer ${apiKey.value}` }
            : {},
        },
      );
      if (!res.ok) throw new Error(`DELETE ${res.status}`);
      setStopError(null);
      clearLiveSession();
      void loadScrapes();
    } catch {
      setStopError("Stop failed — try again");
    }
  };

  return (
    <div className="playground-stack">
      <div className="playground-row playground-row--between">
        <span className="playground-panel__label" style={{ marginBottom: 0 }}>
          interact — /v2/scrape/:jobId/interact
        </span>
        <Button type="button" onClick={() => setRawMode(m => !m)} size="sm">
          {rawMode ? "Form" : "Raw JSON"}
        </Button>
      </div>

      {rawMode ? (
        <Fragment>
          <textarea
            value={rawJson}
            onInput={e => setRawJson((e.target as HTMLTextAreaElement).value)}
            className="playground-textarea playground-textarea--panel"
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
          <Field label="Job ID *">
            <div className="playground-stack">
              <select
                value={String(body.jobId ?? "")}
                onChange={e => {
                  const scrapeId = (e.target as HTMLSelectElement).value;
                  const nextScrape = scrapes.find(
                    scrape => scrape.id === scrapeId,
                  );
                  requestBody.value = {
                    ...requestBody.value,
                    jobId: scrapeId,
                    sessionMode: "reuse",
                  };
                  if (nextScrape?.session?.status === "active") {
                    sessionId.value = nextScrape.session.id;
                    liveViewUrl.value = nextScrape.session.liveViewUrl ?? null;
                    activeInteractJobId.value = scrapeId;
                  } else {
                    clearLiveSession();
                  }
                }}
                className="playground-select"
              >
                <option value="">Select a recent scrape</option>
                {scrapes.map(scrape => (
                  <option key={scrape.id} value={scrape.id}>
                    {scrape.statusLabel} — {scrape.url ?? scrape.id}
                  </option>
                ))}
              </select>
              <div className="playground-row playground-row--between">
                <span className="playground-muted">
                  {scrapesLoading
                    ? "Loading recent scrapes..."
                    : `${scrapes.length} recent scrape${scrapes.length === 1 ? "" : "s"}`}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => void loadScrapes()}
                  disabled={scrapesLoading}
                >
                  Refresh
                </Button>
              </div>
              {scrapesError && (
                <div className="playground-warning__text">{scrapesError}</div>
              )}
              <details className="playground-details">
                <summary>Manual Job ID</summary>
                <input
                  type="text"
                  value={String(body.jobId ?? "")}
                  onInput={e =>
                    (requestBody.value = {
                      ...requestBody.value,
                      jobId: (e.target as HTMLInputElement).value,
                    })
                  }
                  className="playground-input"
                />
              </details>
            </div>
          </Field>
          {selectedScrape && (
            <div className="playground-surface">
              <div className="playground-row playground-row--between">
                <div className="playground-surface__label">Selected scrape</div>
                <span
                  className={[
                    "playground-chip",
                    getStatusChipClass(selectedScrape.statusLabel),
                  ].join(" ")}
                >
                  {selectedScrape.statusLabel}
                </span>
              </div>
              <div className="playground-scrape-meta">
                <span title={selectedScrape.id}>
                  id {truncateMiddle(selectedScrape.id)}
                </span>
                <span title={selectedScrape.url ?? undefined}>
                  {selectedScrape.url ?? "URL unavailable"}
                </span>
                <span>{formatTimestamp(selectedScrape.createdAt)}</span>
                <span>
                  {selectedScrape.isSuccessful ? "success" : "error"}
                  {selectedScrape.error ? `: ${selectedScrape.error}` : ""}
                </span>
                <span>{selectedScrape.actionsCount} actions</span>
                <span>{selectedScrape.waitForMs}ms wait</span>
                <span>{selectedScrape.creditsUsed} credits</span>
              </div>
            </div>
          )}
          {selectedScrape && (
            <div className="playground-surface">
              <div className="playground-surface__label">Run mode</div>
              <div className="playground-run-mode-grid">
                <Button
                  type="button"
                  size="sm"
                  variant={
                    body.sessionMode !== "force-replay" && hasActiveSession
                      ? "primary"
                      : "ghost"
                  }
                  disabled={!hasActiveSession}
                  onClick={() =>
                    (requestBody.value = {
                      ...requestBody.value,
                      sessionMode: "reuse",
                    })
                  }
                >
                  Use live session
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    body.sessionMode !== "force-replay" && !hasActiveSession
                      ? "primary"
                      : "ghost"
                  }
                  disabled={hasActiveSession || !selectedScrape.replayAvailable}
                  onClick={() =>
                    (requestBody.value = {
                      ...requestBody.value,
                      sessionMode: "reuse",
                    })
                  }
                >
                  Replay from scrape
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    body.sessionMode === "force-replay" ? "primary" : "ghost"
                  }
                  disabled={!selectedScrape.replayAvailable}
                  onClick={() =>
                    (requestBody.value = {
                      ...requestBody.value,
                      sessionMode: "force-replay",
                    })
                  }
                >
                  Force new replay
                </Button>
              </div>
              {!selectedScrape.replayAvailable && (
                <div className="playground-warning__text">
                  {selectedScrape.replayUnavailableReason ??
                    "Replay context is unavailable for this scrape."}
                </div>
              )}
            </div>
          )}
          {selectedScrape && (
            <div className="playground-surface">
              <div className="playground-surface__label">Session status</div>
              <div className="playground-scrape-meta">
                <span title={selectedScrape.id}>
                  scrape {truncateMiddle(selectedScrape.id)}
                </span>
                {selectedScrape.session ? (
                  <Fragment>
                    <span title={selectedScrape.session.id}>
                      session {truncateMiddle(selectedScrape.session.id)}
                    </span>
                    <span title={selectedScrape.session.browserId}>
                      browser {truncateMiddle(selectedScrape.session.browserId)}
                    </span>
                    <span>state {selectedScrape.session.status}</span>
                    <span>
                      last activity{" "}
                      {formatAge(selectedScrape.session.updatedAt)}
                    </span>
                    <span>
                      created{" "}
                      {formatTimestamp(selectedScrape.session.createdAt)}
                    </span>
                    <span>
                      session credits{" "}
                      {selectedScrape.session.creditsUsed ?? "unknown"}
                    </span>
                  </Fragment>
                ) : (
                  <span>state missing</span>
                )}
              </div>
              {selectedScrape.session?.liveViewUrl && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    sessionId.value = selectedScrape.session?.id ?? null;
                    liveViewUrl.value =
                      selectedScrape.session?.liveViewUrl ?? null;
                    activeInteractJobId.value = selectedScrape.id;
                  }}
                >
                  Open live view
                </Button>
              )}
            </div>
          )}
          <Field label="Language">
            <select
              value={String(body.language ?? "node")}
              onChange={e =>
                (requestBody.value = {
                  ...requestBody.value,
                  language: (e.target as HTMLSelectElement).value,
                })
              }
              className="playground-input"
            >
              {INTERACT_LANGUAGES.map(language => (
                <option key={language} value={language}>
                  {language}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Timeout">
            <input
              type="number"
              value={String(body.timeout ?? 30)}
              onInput={e =>
                (requestBody.value = {
                  ...requestBody.value,
                  timeout: Number((e.target as HTMLInputElement).value),
                })
              }
              className="playground-input"
            />
          </Field>
          <Field label="Code *">
            <textarea
              value={String(body.code ?? "")}
              onInput={e =>
                (requestBody.value = {
                  ...requestBody.value,
                  code: (e.target as HTMLTextAreaElement).value,
                })
              }
              rows={10}
              className="playground-textarea"
            />
          </Field>
        </Fragment>
      )}

      {validationError && (
        <div className="playground-warning__text">{validationError}</div>
      )}

      {replayBlocked && (
        <div className="playground-warning__text">
          Select a scrape with replay context or use a currently live session.
        </div>
      )}

      {stopError && <div className="playground-warning__text">{stopError}</div>}

      <div className="playground-row playground-row--between">
        <Button type="button" onClick={send} disabled={!canRun}>
          Run interact
        </Button>
        <Button
          type="button"
          onClick={() => void stop()}
          disabled={!sessionId.value}
        >
          End live session
        </Button>
      </div>
    </div>
  );
}
