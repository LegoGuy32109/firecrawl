import { h } from "preact";
import { errorCodeToHttpStatus } from "../../../../lib/error-catalog";
import type { ErrorCodes } from "../../../../lib/error-codes";

type Props = {
  httpStatus: number;
  code?: string;
};

export function StatusPill({ httpStatus, code }: Props) {
  const isOk = httpStatus >= 200 && httpStatus < 300;
  const bg = isOk
    ? "var(--get)"
    : httpStatus >= 400
      ? "#8b1a1a"
      : "var(--post)";

  let mismatch: string | null = null;
  if (code) {
    const expected = errorCodeToHttpStatus(code as ErrorCodes);
    if (expected !== httpStatus) {
      mismatch = `Expected HTTP ${expected} for code ${code}, got ${httpStatus}`;
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        marginBottom: "12px",
      }}
    >
      <span
        style={{
          display: "inline-block",
          padding: "4px 10px",
          background: bg,
          color: "#fff",
          font: "700 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
          alignSelf: "flex-start",
        }}
      >
        HTTP {httpStatus || "—"}
      </span>
      {mismatch && (
        <span
          style={{
            color: "#ffb196",
            fontSize: "12px",
            background: "var(--accent-soft)",
            padding: "6px 10px",
            border: "1px solid #573121",
          }}
        >
          ⚠ Status mismatch: {mismatch}
        </span>
      )}
    </div>
  );
}
