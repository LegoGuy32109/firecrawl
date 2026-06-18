import { h } from "preact";
import { useEffect, useState } from "preact/hooks";

type Status = "unconfigured" | "checking" | "ok" | "auth_error" | "error";

interface HealthResponse {
  status: string;
  backend: string;
}

export function LLMProxyStatus() {
  const proxyUrl =
    (document.getElementById("root") as HTMLElement | null)?.dataset
      .llmProxyUrl ?? "";

  const [status, setStatus] = useState<Status>(
    proxyUrl ? "checking" : "unconfigured",
  );
  const [backend, setBackend] = useState<string>("");

  useEffect(() => {
    if (!proxyUrl) return;

    let cancelled = false;

    fetch(`${proxyUrl}/health`)
      .then(async res => {
        if (cancelled) return;
        if (res.ok) {
          const data: HealthResponse = await res.json();
          setBackend(data.backend ?? "");
          setStatus("ok");
        } else if (res.status === 401) {
          setStatus("auth_error");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [proxyUrl]);

  const dotColor =
    status === "ok"
      ? "#22c55e"
      : status === "unconfigured" || status === "checking"
        ? "var(--muted)"
        : "#ef4444";

  const labelText =
    status === "unconfigured"
      ? "LLM Proxy: not configured"
      : status === "checking"
        ? "LLM Proxy: checking..."
        : status === "ok"
          ? `LLM Proxy: connected · ${backend} · ~5s/step`
          : status === "auth_error"
            ? "LLM Proxy: auth error"
            : "LLM Proxy: error";

  const tooltip =
    status === "auth_error"
      ? "docker run -it --volume codex-auth:/root/.codex <image> codex login"
      : undefined;

  return (
    <div
      title={tooltip}
      className="playground-row playground-muted"
      style={{
        fontSize: "11px",
        cursor: tooltip ? "help" : "default",
        userSelect: "none",
      }}
    >
      <span
        className="playground-diagnostics__dot"
        style={{ width: "7px", height: "7px", background: dotColor }}
      />
      {labelText}
    </div>
  );
}
