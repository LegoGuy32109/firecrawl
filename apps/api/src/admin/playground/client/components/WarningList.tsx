import { h } from "preact";
import {
  explainWarning,
  parseWarningCode,
} from "../../../../lib/error-catalog";

type Warning = {
  code: string;
  message: string;
  details?: unknown;
};

type Props = {
  warnings?: Warning[];
  legacyWarning?: string;
};

export function WarningList({ warnings, legacyWarning }: Props) {
  if (!warnings?.length && !legacyWarning) return null;

  return (
    <div className="playground-diagnostics">
      <div className="playground-panel__label">Warnings</div>
      <div className="playground-stack">
        {warnings?.map((w, i) => {
          const parsedCode = parseWarningCode(w.code);
          const catalog = parsedCode ? explainWarning(parsedCode) : null;
          return (
            <div key={i} className="playground-warning">
              <div className="playground-row playground-row--between">
                <code className="playground-warning__code">{w.code}</code>
              </div>
              <div className="playground-warning__text">{w.message}</div>
              {catalog && (
                <div className="playground-warning__meta">
                  <span>{catalog.explanation}</span>
                  {" · "}
                  <span>Fix: {catalog.fix}</span>
                </div>
              )}
              {w.details && (
                <pre className="playground-warning__details">
                  {JSON.stringify(w.details, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
        {!warnings?.length && legacyWarning && (
          <div className="playground-warning playground-warning__text">
            {legacyWarning}
          </div>
        )}
      </div>
    </div>
  );
}
