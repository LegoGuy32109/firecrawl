import type { Request } from "express";
import WSWebSocket from "ws";

/**
 * Creates a bidirectional WebSocket proxy handler that derives the upstream target URL
 * dynamically from each incoming request.
 *
 * Usage:
 *   router.ws('/some/path/:id/view', createLivecastWS(req => `ws://.../${req.params.id}/view`));
 */
export function createLivecastWS(
  getTargetUrl: (req: Request) => string | null,
  // TODO: add getHeaders?: (req: Request) => Record<string, string> | undefined
  // so the proxy can forward Authorization: Bearer BROWSER_SERVICE_API_KEY
  // upstream when browser service auth is enforced (Step 3 of course corrections).
) {
  return function livecastWsHandler(clientWs: WSWebSocket, req: Request): void {
    try {
      const targetUrl = getTargetUrl(req);
      if (!targetUrl) {
        clientWs.close(1011, "No upstream URL configured");
        return;
      }

      const wsWorker = new WSWebSocket(targetUrl);

      wsWorker.on("open", () => {
        clientWs.on("message", (data: WSWebSocket.RawData) => {
          if (wsWorker.readyState === WSWebSocket.OPEN) {
            wsWorker.send(data);
          }
        });

        wsWorker.on("message", (data: WSWebSocket.RawData) => {
          if (clientWs.readyState === WSWebSocket.OPEN) {
            clientWs.send(data);
          }
        });

        clientWs.on("close", () => {
          if (wsWorker.readyState === WSWebSocket.OPEN) {
            wsWorker.close();
          }
        });

        wsWorker.on("close", () => {
          if (clientWs.readyState === WSWebSocket.OPEN) {
            clientWs.close();
          }
        });
      });

      wsWorker.on("error", () => {
        if (clientWs.readyState === WSWebSocket.OPEN) {
          clientWs.close(1014, "Upstream connection failed");
        }
      });

      clientWs.on("error", () => {
        if (wsWorker.readyState === WSWebSocket.OPEN) {
          wsWorker.close();
        }
      });
    } catch (error) {
      clientWs.close(1011, "Internal proxy error");
    }
  };
}
