import { v7 as uuidv7 } from "uuid";
import { Response } from "express";
import {
  AgentRequest,
  AgentResponse,
  RequestWithAuth,
  agentRequestSchema,
} from "./types";
import { logger as _logger } from "../../lib/logger";
import { logRequest } from "../../services/logging/log_job";
import { config } from "../../config";
import { agentConsumeFreeRequestIfLeft } from "../../db/rpc";
import { getScrapeZDR } from "../../lib/zdr-helpers";
import { errorResponse } from "./response-enveloper";
import {
  AgentError,
  DependencyError,
  RequestError,
} from "../../lib/error-codes";

export async function agentController(
  req: RequestWithAuth<{}, AgentResponse, AgentRequest>,
  res: Response<AgentResponse>,
) {
  const agentId = uuidv7();
  const logger = _logger.child({
    agentId,
    extractId: agentId,
    jobId: agentId,
    teamId: req.auth.team_id,
    team_id: req.auth.team_id,
    module: "api/v2",
    method: "agentController",
    zeroDataRetention: getScrapeZDR(req.acuc?.flags) === "forced",
  });

  const originalRequest = { ...req.body };
  req.body = agentRequestSchema.parse(req.body);

  if (getScrapeZDR(req.acuc?.flags) === "forced") {
    const envelope = errorResponse(
      RequestError.BAD_REQUEST,
      "Your team has zero data retention enabled. This is not supported on extract. Please contact support@firecrawl.com to unblock this feature.",
      req,
      { httpStatus: 400 },
    );
    return res.status(envelope.httpStatus).json(envelope.body);
  }

  _logger.info("Agent starting...", {
    request: req.body,
    originalRequest,
    subId: req.acuc?.sub_id,
    zeroDataRetention: getScrapeZDR(req.acuc?.flags) === "forced",
  });

  if (!config.EXTRACT_V3_BETA_URL) {
    const envelope = errorResponse(
      DependencyError.UNAVAILABLE,
      "Agent beta is not enabled.",
      req,
      { httpStatus: 503 },
    );
    return res.status(envelope.httpStatus).json(envelope.body);
  }

  // If maxCredits > 2500, skip free request consumption — this is always a paid request
  const highCreditRequest =
    req.body.maxCredits !== undefined && req.body.maxCredits > 2500;

  let freeRequest: any;

  if (config.USE_DB_AUTHENTICATION && !highCreditRequest) {
    freeRequest = await agentConsumeFreeRequestIfLeft(req.auth.team_id);
  }

  const isFreeRequest = highCreditRequest
    ? false
    : config.USE_DB_AUTHENTICATION
      ? !!freeRequest?.[0]?.consumed
      : true;

  await logRequest({
    id: agentId,
    kind: "agent",
    api_version: "v2",
    team_id: req.auth.team_id,
    origin: req.body.origin ?? "api",
    integration: req.body.integration,
    target_hint: req.body.urls?.[0] ?? req.body.prompt ?? "",
    zeroDataRetention: false, // not supported for agent
    api_key_id: req.acuc?.api_key_id ?? null,
  });

  const passthrough = await fetch(
    config.EXTRACT_V3_BETA_URL + "/internal/extracts",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.AGENT_INTEROP_SECRET}`,
      },
      body: JSON.stringify({
        id: agentId,
        urls: req.body.urls,
        schema: req.body.schema,
        prompt: req.body.prompt,
        apiKey: req.acuc!.api_key,
        apiKeyId: req.acuc!.api_key_id ?? undefined,
        teamId: req.auth.team_id,
        isFreeRequest,
        maxCredits: req.body.maxCredits ?? undefined,
        strictConstrainToURLs: req.body.strictConstrainToURLs ?? undefined,
        webhook: req.body.webhook ?? undefined,
        model: req.body.model,
      }),
    },
  );

  if (passthrough.status !== 200) {
    const text = await passthrough.text();

    logger.error("Failed to passthrough agent request.", {
      status: passthrough.status,
      text,
    });
    const envelope = errorResponse(
      AgentError.UPSTREAM,
      "Failed to passthrough agent request.",
      req,
      {
        httpStatus: 502,
        details: {
          status: passthrough.status,
          body: text,
        },
      },
    );
    return res.status(envelope.httpStatus).json(envelope.body);
  }

  return res.status(200).json({
    success: true,
    id: agentId,
  });
}
