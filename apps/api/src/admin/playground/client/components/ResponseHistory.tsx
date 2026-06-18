import { h } from "preact";
import { useState } from "preact/hooks";
import {
  activeFeature,
  activeView,
  historyEntries,
  requestBody,
  requestDockMode,
  lastVisibleDockMode,
} from "../signals";
import {
  clearCompletedHistory,
  normalizeWarnings,
  removeHistoryEntry,
  restoreRequestBody,
  setHistoryEntryUiState,
  type PlaygroundHistoryEntry,
} from "../history";
import { StatusPill } from "./StatusPill";
import { SuccessView } from "./SuccessView";
import { ErrorView } from "./ErrorView";
import { WarningList } from "./WarningList";
import { EmptyState } from "./ui/EmptyState";
import { Button } from "./ui/Button";
import { JsonView } from "./JsonView";

type ModalState = { type: "delete"; id: string } | { type: "clear" } | null;

function formatTimestamp(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatDuration(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
}

function formatCredits(creditsUsed?: number): string {
  return typeof creditsUsed === "number"
    ? `${creditsUsed} credits`
    : "- credits";
}

function getEntryBody(entry: PlaygroundHistoryEntry): Record<string, unknown> {
  return entry.body ?? {};
}

function isErrorEntry(entry: PlaygroundHistoryEntry): boolean {
  const body = getEntryBody(entry);
  const status = entry.status ?? 0;
  return (
    status >= 400 ||
    (status === 0 && !!entry.errorMessage) ||
    body.success === false ||
    body.status === "failed" ||
    typeof body.error === "string"
  );
}

function restoreEntry(entry: PlaygroundHistoryEntry) {
  activeFeature.value = entry.feature;
  activeView.value = entry.feature;
  if (requestDockMode.value === "hide") {
    requestDockMode.value = lastVisibleDockMode.value;
  }
  requestBody.value = restoreRequestBody(entry);
  historyEntries.value = setHistoryEntryUiState(
    historyEntries.value,
    entry.id,
    {
      open: true,
      panel: "request",
    },
  );
}

function EntryHeader({
  entry,
  globalHistory,
  bodyId,
  onDelete,
}: {
  entry: PlaygroundHistoryEntry;
  globalHistory: boolean;
  bodyId: string;
  onDelete: () => void;
}) {
  const statusLabel = entry.pending ? "Sending" : `HTTP ${entry.status ?? "—"}`;

  return (
    <div
      role="button"
      tabIndex={0}
      className="playground-response-entry__header"
      aria-expanded={entry.ui.open}
      aria-controls={bodyId}
      onClick={() => {
        historyEntries.value = setHistoryEntryUiState(
          historyEntries.value,
          entry.id,
          { open: !entry.ui.open },
        );
      }}
      onKeyDown={e => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        historyEntries.value = setHistoryEntryUiState(
          historyEntries.value,
          entry.id,
          { open: !entry.ui.open },
        );
      }}
    >
      <div className="playground-response-entry__header-main">
        {entry.pending ? (
          <span className="playground-chip playground-chip--warning">
            {statusLabel}
          </span>
        ) : (
          <StatusPill httpStatus={entry.status ?? 0} code={entry.code} />
        )}
        {globalHistory && (
          <span className="playground-chip playground-chip--muted">
            {entry.feature}
          </span>
        )}
        <span
          className="playground-response-entry__target"
          title={entry.target}
        >
          {entry.target}
        </span>
      </div>

      <div className="playground-response-entry__header-meta">
        <span className="playground-chip playground-chip--muted">
          {entry.pending
            ? formatTimestamp(entry.startedAt)
            : formatTimestamp(entry.completedAt ?? entry.startedAt)}
        </span>
        <span className="playground-chip playground-chip--muted">
          {formatDuration(entry.durationMs)}
        </span>
        <span className="playground-chip playground-chip--muted">
          {formatCredits(entry.creditsUsed)}
        </span>
        {entry.code && !entry.pending && (
          <span className="playground-chip playground-chip--muted">
            {entry.code}
          </span>
        )}
        {entry.warningCount > 0 && (
          <span className="playground-chip playground-chip--muted">
            {entry.warningCount} warning{entry.warningCount === 1 ? "" : "s"}
          </span>
        )}
        {!entry.persisted && !entry.pending && (
          <span className="playground-chip playground-chip--muted">
            not saved
          </span>
        )}
        {!entry.pending && (
          <Button
            type="button"
            size="xs"
            variant="danger"
            onClick={e => {
              e.stopPropagation();
              onDelete();
            }}
          >
            x
          </Button>
        )}
      </div>
    </div>
  );
}

function EntryBody({
  entry,
  onUpdate,
}: {
  entry: PlaygroundHistoryEntry;
  onUpdate: (patch: Partial<PlaygroundHistoryEntry>) => void;
}) {
  const body = getEntryBody(entry);
  const isError = isErrorEntry(entry);
  const warnings = entry.warnings ?? normalizeWarnings(body);
  const legacyWarning =
    entry.legacyWarning ??
    (typeof body.warning === "string" ? body.warning : undefined);
  const requestLabel = `${entry.method} ${entry.endpoint}`;

  return (
    <div className="playground-response-entry__body">
      <div className="playground-tabs">
        <button
          type="button"
          className={[
            "playground-tab",
            entry.ui.panel === "request" && "playground-tab--active",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onUpdate({ ui: { ...entry.ui, panel: "request" } })}
        >
          Request
        </button>
        <span className="playground-response-tabs__separator" />
        <button
          type="button"
          className={[
            "playground-tab",
            entry.ui.panel === "response" && "playground-tab--active",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onUpdate({ ui: { ...entry.ui, panel: "response" } })}
        >
          Response
        </button>
      </div>

      {entry.ui.panel === "request" ? (
        <div className="playground-stack">
          <div className="playground-surface">
            <div className="playground-surface__label">Request</div>
            <div className="playground-row playground-row--between">
              <code className="playground-code">{requestLabel}</code>
              <Button
                type="button"
                size="xs"
                onClick={() => restoreEntry(entry)}
              >
                Restore request
              </Button>
            </div>
            <div style={{ marginTop: "12px" }}>
              <JsonView value={entry.requestBody} collapsed={2} />
            </div>
          </div>
        </div>
      ) : entry.pending ? (
        <div className="playground-surface">
          <div className="playground-surface__label">Response</div>
          <div className="playground-warning__text">Sending...</div>
        </div>
      ) : (
        <div className="playground-stack">
          {isErrorEntry(entry) ? (
            <ErrorView body={body} />
          ) : (
            <SuccessView
              body={body}
              feature={entry.feature}
              warnings={entry.feature === "scrape" ? warnings : undefined}
              legacyWarning={
                entry.feature === "scrape" ? legacyWarning : undefined
              }
              activeTab={entry.ui.responseTab}
              onActiveTabChange={tab =>
                onUpdate({ ui: { ...entry.ui, responseTab: tab } })
              }
            />
          )}
          {!(entry.feature === "scrape" && !isError) && (
            <WarningList warnings={warnings} legacyWarning={legacyWarning} />
          )}
        </div>
      )}
    </div>
  );
}

export function ResponseHistory() {
  const [modal, setModal] = useState<ModalState>(null);
  const view = activeView.value;
  const feature = activeFeature.value;

  const entries =
    view === "history"
      ? historyEntries.value
      : historyEntries.value.filter(entry => entry.feature === feature);

  const creditsTotal = entries.reduce(
    (sum, entry) =>
      sum + (typeof entry.creditsUsed === "number" ? entry.creditsUsed : 0),
    0,
  );
  const unknownCount = entries.filter(
    entry => !entry.pending && typeof entry.creditsUsed !== "number",
  ).length;

  const headerLabel =
    view === "history"
      ? `History (${entries.length}) | ${creditsTotal} credits | ${unknownCount} unknown`
      : `Responses (${entries.length}) | ${creditsTotal} credits | ${unknownCount} unknown`;

  const setEntry = (id: string, patch: Partial<PlaygroundHistoryEntry>) => {
    historyEntries.value = historyEntries.value.map(entry =>
      entry.id === id
        ? { ...entry, ...patch, ui: patch.ui ?? entry.ui }
        : entry,
    );
  };

  const deleteEntry = (id: string) => {
    historyEntries.value = removeHistoryEntry(historyEntries.value, id);
    setModal(null);
  };

  const clearHistory = () => {
    historyEntries.value = clearCompletedHistory(historyEntries.value);
    setModal(null);
  };

  if (entries.length === 0) {
    return (
      <div className="playground-stack">
        <div className="playground-row playground-row--between">
          <div className="playground-panel__label" style={{ marginBottom: 0 }}>
            {headerLabel}
          </div>
          {view === "history" && (
            <Button type="button" size="sm" disabled>
              Clear history
            </Button>
          )}
        </div>
        <EmptyState>
          {view === "history"
            ? "No saved responses yet"
            : `No ${feature} responses yet`}
        </EmptyState>
        {modal && (
          <ConfirmModal
            modal={modal}
            onCancel={() => setModal(null)}
            onConfirm={() => {
              if (modal.type === "clear") clearHistory();
              if (modal.type === "delete") deleteEntry(modal.id);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="playground-stack">
      <div className="playground-row playground-row--between">
        <div className="playground-panel__label" style={{ marginBottom: 0 }}>
          {headerLabel}
        </div>
        {view === "history" && (
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={() => setModal({ type: "clear" })}
          >
            Clear history
          </Button>
        )}
      </div>

      <div className="playground-stack">
        {entries.map(entry => (
          <section
            key={entry.id}
            className="playground-response-entry"
            id={`playground-response-entry-${entry.id}`}
          >
            <EntryHeader
              entry={entry}
              globalHistory={view === "history"}
              bodyId={`playground-response-entry-${entry.id}`}
              onDelete={() => setModal({ type: "delete", id: entry.id })}
            />
            {entry.ui.open && (
              <EntryBody
                entry={entry}
                onUpdate={patch => setEntry(entry.id, patch)}
              />
            )}
          </section>
        ))}
      </div>

      {modal && (
        <ConfirmModal
          modal={modal}
          onCancel={() => setModal(null)}
          onConfirm={() => {
            if (modal.type === "clear") clearHistory();
            if (modal.type === "delete") deleteEntry(modal.id);
          }}
        />
      )}
    </div>
  );
}

function ConfirmModal({
  modal,
  onCancel,
  onConfirm,
}: {
  modal: ModalState;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDelete = !!modal && modal.type === "delete";
  const entry = isDelete
    ? historyEntries.value.find(item => item.id === modal.id)
    : null;

  return (
    <div
      className="playground-modal-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="playground-modal"
        role="dialog"
        aria-modal="true"
        onKeyDown={e => {
          if (e.key === "Escape") onCancel();
        }}
        tabIndex={-1}
      >
        <div className="playground-modal__header">
          <h2 className="playground-modal__title">
            {isDelete ? "Delete response" : "Clear history"}
          </h2>
          <Button type="button" size="xs" onClick={onCancel}>
            Close
          </Button>
        </div>
        <div className="playground-modal__body">
          <div className="playground-warning__text">
            {isDelete ? (
              <>
                Delete the response for{" "}
                <strong>{entry?.target ?? "this request"}</strong>.
              </>
            ) : (
              <>
                Clear completed responses. Pending requests stay visible and
                will complete normally.
              </>
            )}
          </div>
          {isDelete && entry && (
            <div className="playground-surface">
              <div className="playground-surface__label">Request</div>
              <div className="playground-row">
                <code className="playground-code">
                  {entry.method} {entry.endpoint}
                </code>
              </div>
              <div className="playground-muted" style={{ marginTop: "6px" }}>
                {formatTimestamp(entry.completedAt ?? entry.startedAt)}
              </div>
            </div>
          )}
          <div className="playground-modal__actions">
            <Button type="button" autoFocus onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={onConfirm}>
              {isDelete ? "Delete" : "Clear history"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
