import { useEffect, useRef, useState } from "preact/hooks";
import { sessionId, interactive } from "../signals";

type ConnectionState = "idle" | "connecting" | "streaming" | "disconnected";

export function LiveView() {
  const sid = sessionId.value;
  const isInteractive = interactive.value;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connState, setConnState] = useState<ConnectionState>("idle");

  function connect() {
    if (!sid) return;
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnState("connecting");
    const wsUrl = new URL(
      `./session/${encodeURIComponent(sid)}/view`,
      location.href,
    );
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(wsUrl.toString());
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => setConnState("streaming");

    ws.onmessage = event => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      let blob: Blob;
      if (event.data instanceof ArrayBuffer) {
        blob = new Blob([event.data], { type: "image/jpeg" });
      } else if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          if (msg.method === "Page.screencastFrame" && msg.params?.data) {
            const bytes = atob(msg.params.data);
            const arr = new Uint8Array(bytes.length);
            for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
            blob = new Blob([arr], { type: "image/jpeg" });
          } else {
            return;
          }
        } catch {
          return;
        }
      } else {
        blob = event.data as Blob;
      }

      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };

    ws.onclose = () => setConnState("disconnected");
    ws.onerror = () => setConnState("disconnected");
  }

  function disconnect() {
    wsRef.current?.close();
    wsRef.current = null;
    setConnState("idle");
  }

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  function forwardPointerEvent(e: PointerEvent) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    ws.send(
      JSON.stringify({
        type: "pointer",
        eventType: e.type,
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
        button: e.button,
      }),
    );
  }

  function forwardKeyEvent(e: KeyboardEvent) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "key",
        eventType: e.type,
        key: e.key,
        code: e.code,
      }),
    );
  }

  const statusColors: Record<ConnectionState, string> = {
    idle: "var(--ink)",
    connecting: "var(--accent)",
    streaming: "#4ade80",
    disconnected: "#f87171",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <span style={{ color: statusColors[connState], fontSize: "12px" }}>
          ● {connState}
        </span>
        {connState === "idle" || connState === "disconnected" ? (
          <button onClick={connect} disabled={!sid}>
            Start live view
          </button>
        ) : (
          <button onClick={disconnect}>Stop</button>
        )}
        <label
          style={{
            display: "flex",
            gap: "4px",
            alignItems: "center",
            fontSize: "12px",
          }}
        >
          <input
            type="checkbox"
            checked={isInteractive}
            onChange={e => {
              interactive.value = (e.target as HTMLInputElement).checked;
            }}
          />
          Interactive
        </label>
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          border: "1px solid var(--panel)",
          cursor: isInteractive ? "crosshair" : "default",
          display: connState === "idle" ? "none" : "block",
        }}
        onPointerDown={isInteractive ? (forwardPointerEvent as any) : undefined}
        onPointerUp={isInteractive ? (forwardPointerEvent as any) : undefined}
        onPointerMove={isInteractive ? (forwardPointerEvent as any) : undefined}
        onKeyDown={isInteractive ? (forwardKeyEvent as any) : undefined}
        onKeyUp={isInteractive ? (forwardKeyEvent as any) : undefined}
        tabIndex={isInteractive ? 0 : undefined}
      />
    </div>
  );
}
