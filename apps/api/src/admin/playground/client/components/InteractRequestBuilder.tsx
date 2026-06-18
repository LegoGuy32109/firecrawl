import { h, Fragment } from "preact";
import { useState } from "preact/hooks";
import {
  apiKey,
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

export function InteractRequestBuilder() {
  const body = requestBody.value;
  const [rawMode, setRawMode] = useState(false);
  const [rawJson, setRawJson] = useState("{}");
  const validationError = getInteractRequestValidationError(
    body,
    rawMode,
    rawJson,
  );
  const canRun = !inflight.value && !validationError;

  const send = async () => {
    if (validationError) return;
    const nextBody = buildInteractRequestBody(body, rawMode, rawJson);
    if (!nextBody) return;
    requestBody.value = nextBody;
    inflight.value = true;
    sessionId.value = null;
    liveViewUrl.value = null;

    const startedAt = Date.now();
    const id = makeEntryId();
    const jobId =
      typeof nextBody.jobId === "string" ? nextBody.jobId : "interact";
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
          </Field>
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

      <div className="playground-row playground-row--between">
        <Button type="button" onClick={send} disabled={!canRun}>
          Run interact
        </Button>
      </div>
    </div>
  );
}
