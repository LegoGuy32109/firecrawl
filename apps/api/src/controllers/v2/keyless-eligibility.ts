import { Request, Response } from "express";
import { config } from "../../config";
import { checkKeylessEligibility } from "../../lib/keyless";
import { errorResponse } from "./response-enveloper";
import { AuthError } from "../../lib/error-codes";

/**
 * Internal endpoint for trusted proxies (the hosted MCP) to check, at connect
 * time, whether a client IP can currently use the keyless tier — without
 * consuming quota. Gated by the shared KEYLESS_PROXY_SECRET; the client IP is
 * supplied via x-firecrawl-keyless-ip. Lets the MCP serve keyless when eligible
 * and throw (→ OAuth 401 challenge) when the IP is out of free quota.
 */
export async function keylessEligibilityController(
  req: Request,
  res: Response,
): Promise<void> {
  const secret = req.headers["x-firecrawl-keyless-secret"];
  if (!config.KEYLESS_PROXY_SECRET || secret !== config.KEYLESS_PROXY_SECRET) {
    const code =
      !config.KEYLESS_PROXY_SECRET || secret === undefined
        ? AuthError.MISSING_API_KEY
        : AuthError.INVALID_API_KEY;
    const response = errorResponse(code, "Unauthorized", req, {
      details:
        code === AuthError.INVALID_API_KEY
          ? { reason: "keyless proxy secret mismatch" }
          : undefined,
    });
    res.status(response.httpStatus).json({ ...response.body, eligible: false });
    return;
  }

  const ipHeader = req.headers["x-firecrawl-keyless-ip"];
  const ip =
    (typeof ipHeader === "string" ? ipHeader.trim() : "") || req.ip || "";

  const result = await checkKeylessEligibility(ip);
  res.status(200).json(result);
}
