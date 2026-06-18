import type { Request, Response } from "express";
import {
  browserServiceRequest,
  BrowserServiceError,
  type BrowserServiceCreateResponse,
  type BrowserServiceDeleteResponse,
} from "../../lib/scrape-interact/browser-service-client";
import { getBrowserSession } from "../../lib/browser-sessions";
import { config } from "../../config";

export async function createPlaygroundSession(
  req: Request,
  res: Response,
): Promise<void> {
  if (!config.BROWSER_SERVICE_URL) {
    res.status(503).json({
      ok: false,
      error: "Browser service is not configured.",
    });
    return;
  }

  try {
    const svcResponse =
      await browserServiceRequest<BrowserServiceCreateResponse>(
        "POST",
        "/browsers",
        { ttl: 600, streamWebView: true },
      );

    res.status(200).json({
      sessionId: svcResponse.sessionId,
      viewUrl: svcResponse.viewUrl,
      liveViewUrl: svcResponse.viewUrl,
      iframeUrl: svcResponse.iframeUrl,
      interactiveIframeUrl: svcResponse.interactiveIframeUrl,
      expiresAt: svcResponse.expiresAt,
    });
  } catch (err) {
    if (err instanceof BrowserServiceError) {
      res
        .status(err.status >= 400 && err.status < 600 ? err.status : 502)
        .json({
          ok: false,
          error: err.message,
        });
    } else {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
}

export async function deletePlaygroundSession(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  if (!config.BROWSER_SERVICE_URL) {
    res.status(503).json({
      ok: false,
      error: "Browser service is not configured.",
    });
    return;
  }

  try {
    const result = await browserServiceRequest<BrowserServiceDeleteResponse>(
      "DELETE",
      `/browsers/${id}`,
    );

    res.status(200).json({
      ok: result.ok ?? true,
      sessionDurationMs: result.sessionDurationMs,
      screenshotUrl: (result as any).screenshotUrl ?? null,
      recordingUrl: (result as any).recordingUrl ?? null,
    });
  } catch (err) {
    if (err instanceof BrowserServiceError) {
      const status =
        err.status === 404
          ? 404
          : err.status >= 400 && err.status < 600
            ? err.status
            : 502;
      res.status(status).json({
        ok: false,
        error: err.message,
      });
    } else {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }
}

export async function getPlaygroundSession(
  req: Request,
  res: Response,
): Promise<void> {
  const { id } = req.params;

  const session = await getBrowserSession(id);
  if (!session) {
    res.status(404).json({
      ok: false,
      error: "Session not found.",
    });
    return;
  }

  res.status(200).json({
    ok: true,
    sessionId: session.id,
    status: session.status,
    cdpUrl: session.cdp_url,
    viewUrl: session.cdp_path,
    interactiveViewUrl: session.cdp_interactive_path,
    createdAt: session.created_at,
    updatedAt: session.updated_at,
  });
}
