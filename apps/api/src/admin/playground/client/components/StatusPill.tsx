import { h } from "preact";
import { errorCodeToHttpStatus } from "../../../../lib/error-catalog";
import type { ErrorCodes } from "../../../../lib/error-codes";

type Props = {
  httpStatus: number;
  code?: string;
};

export function StatusPill({ httpStatus, code }: Props) {
  const isOk = httpStatus >= 200 && httpStatus < 300;
  const className = isOk
    ? "playground-chip playground-chip--success"
    : httpStatus >= 400
      ? "playground-chip playground-chip--danger"
      : "playground-chip playground-chip--warning";

  let mismatch: string | null = null;
  if (code) {
    const expected = errorCodeToHttpStatus(code as ErrorCodes);
    if (expected !== httpStatus) {
      mismatch = `Expected HTTP ${expected} for code ${code}, got ${httpStatus}`;
    }
  }

  return (
    <div className="playground-status">
      <span className={className}>HTTP {httpStatus || "—"}</span>
      {mismatch && (
        <span className="playground-status__mismatch">
          Status mismatch: {mismatch}
        </span>
      )}
    </div>
  );
}
