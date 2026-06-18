import { useEffect, useRef, useState } from "preact/hooks";
import { liveViewUrl, interactive } from "../signals";
import { Button } from "./ui/Button";

type ConnectionState = "idle" | "connecting" | "streaming" | "disconnected";

export function LiveView() {
  const targetUrl = liveViewUrl.value;
  const isInteractive = interactive.value;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connState, setConnState] = useState<ConnectionState>("idle");

  function connect(url = targetUrl) {
    if (!url) return;
    if (wsRef.current) {
      wsRef.current.close();
    }

    setConnState("connecting");
    const wsUrl = new URL(url, location.href);
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

  useEffect(() => {
    if (!targetUrl) {
      disconnect();
      return;
    }

    connect(targetUrl);

    return () => {
      wsRef.current?.close();
    };
  }, [targetUrl]);

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
    <div className="playground-stack">
      <div className="playground-row">
        <span style={{ color: statusColors[connState], fontSize: "12px" }}>
          ● {connState}
        </span>
        {connState === "idle" || connState === "disconnected" ? (
          <Button type="button" onClick={() => connect()} disabled={!targetUrl}>
            Start live view
          </Button>
        ) : (
          <Button type="button" onClick={disconnect}>
            Stop
          </Button>
        )}
        <label className="playground-switch">
          <input
            type="checkbox"
            checked={isInteractive}
            onChange={e => {
              interactive.value = (e.target as HTMLInputElement).checked;
            }}
          />
          <span className="playground-switch__label">Interactive</span>
        </label>
      </div>
      <canvas
        ref={canvasRef}
        className="playground-media-tile"
        style={{
          width: "100%",
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
