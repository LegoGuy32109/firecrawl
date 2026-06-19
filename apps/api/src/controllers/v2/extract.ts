import { v7 as uuidv7 } from "uuid";
import { Response } from "express";
import {
  RequestWithAuth,
  ExtractRequest,
  extractRequestSchema,
  ExtractResponse,
} from "./types";
import { addExtractJobToQueue } from "../../services/queue-service";
import { saveExtract } from "../../lib/extract/extract-redis";
import { UNSUPPORTED_SITE_MESSAGE } from "../../lib/strings";
import { isUrlBlocked } from "../../scraper/WebScraper/utils/blocklist";
import { logger as _logger } from "../../lib/logger";
import { logRequest } from "../../services/logging/log_job";
import { getScrapeZDR } from "../../lib/zdr-helpers";
import { makeResponder } from "./response-enveloper";
import { ExtractError, RequestError } from "../../lib/error-codes";

/**
 * Extracts data from the provided URLs based on the request parameters.
 * Currently in beta.
 * @param req - The request object containing authentication and extraction details.
 * @param res - The response object to send the extraction results.
 * @returns A promise that resolves when the extraction process is complete.
 */
export async function extractController(
  req: RequestWithAuth<{}, ExtractResponse, ExtractRequest>,
  res: Response<ExtractResponse>,
) {
  const r = makeResponder(req, res);
  const originalRequest = { ...req.body };
  req.body = extractRequestSchema.parse(req.body);

  if (getScrapeZDR(req.acuc?.flags) === "forced") {
    return r.fail(
      RequestError.BAD_REQUEST,
      "Your team has zero data retention enabled. This is not supported on extract. Please contact support@firecrawl.com to unblock this feature.",
    );
  }

  const extractId = uuidv7();
  const createdAt = Date.now();
  _logger.info("Extract starting...", {
    request: req.body,
    originalRequest,
    teamId: req.auth.team_id,
    team_id: req.auth.team_id,
    subId: req.acuc?.sub_id,
    extractId,
    zeroDataRetention: getScrapeZDR(req.acuc?.flags) === "forced",
  });

  if (req.body.agent?.model === "v3-beta") {
    return r.fail(
      RequestError.BAD_REQUEST,
      "Use the new /agent endpoint instead of passing agent.model=v3-beta into /extract.",
    );
  }

  const invalidURLs: string[] =
    req.body.urls?.filter((url: string) =>
      isUrlBlocked(url, req.acuc?.flags ?? null, {
        team_id: req.auth.team_id,
        origin: req.body.origin ?? null,
      }),
    ) ?? [];

  if (invalidURLs.length > 0 && !req.body.ignoreInvalidURLs) {
    if (!res.headersSent) {
      return r.fail(ExtractError.NO_VALID_URLS, UNSUPPORTED_SITE_MESSAGE);
    }
  }

  await logRequest({
    id: extractId,
    kind: "extract",
    api_version: "v2",
    team_id: req.auth.team_id,
    origin: req.body.origin ?? "api",
    integration: req.body.integration,
    target_hint: req.body.urls?.[0] ?? "",
    zeroDataRetention: false, // not supported for extract
    api_key_id: req.acuc?.api_key_id ?? null,
  });

  const jobData = {
    request: req.body,
    teamId: req.auth.team_id,
    subId: req.acuc?.sub_id,
    extractId,
    agent: req.body.agent,
    createdAt,
  };

  await saveExtract(extractId, {
    id: extractId,
    team_id: req.auth.team_id,
    createdAt,
    status: "processing",
    showSteps: req.body.__experimental_streamSteps,
    showLLMUsage: req.body.__experimental_llmUsage,
    showSources: req.body.__experimental_showSources || req.body.showSources,
    showCostTracking: req.body.__experimental_showCostTracking,
    zeroDataRetention: getScrapeZDR(req.acuc?.flags) === "forced",
  });

  await addExtractJobToQueue(extractId, {
    ...jobData,
    apiKeyId: req.acuc?.api_key_id ?? undefined,
  });

  return r.ok({
    id: extractId,
    urlTrace: [],
    ...(invalidURLs.length > 0 && req.body.ignoreInvalidURLs
      ? {
          invalidURLs,
        }
      : {}),
  });
}
