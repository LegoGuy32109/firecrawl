import { Response } from "express";
import { AgentStatusResponse, RequestWithAuth } from "./types";
import {
  supabaseGetAgentByIdDirect,
  supabaseGetAgentRequestByIdDirect,
} from "../../lib/supabase-jobs";
import { logger as _logger, logger } from "../../lib/logger";
import { getJobFromGCS } from "../../lib/gcs-jobs";
import { config } from "../../config";
import { CommonError, LifecycleError } from "../../lib/error-codes";
import { makeResponder } from "./response-enveloper";
import { deserializeTransportableError } from "../../lib/error-serde";

export async function agentStatusController(
  req: RequestWithAuth<{ jobId: string }, AgentStatusResponse, any>,
  res: Response<AgentStatusResponse>,
) {
  const r = makeResponder(req, res);
  const agentRequest = await supabaseGetAgentRequestByIdDirect(
    req.params.jobId,
  );

  if (!agentRequest || agentRequest.team_id !== req.auth.team_id) {
    return r.fail(
      !agentRequest
        ? LifecycleError.JOB_NOT_FOUND
        : LifecycleError.JOB_WRONG_TEAM,
      "Agent job not found",
    );
  }

  const agent = await supabaseGetAgentByIdDirect(req.params.jobId);

  let model: "spark-1-pro" | "spark-1-mini";
  if (agent) {
    model = (agent.options?.model ?? "spark-1-pro") as
      | "spark-1-pro"
      | "spark-1-mini";
  } else {
    try {
      const optionsRequest = await fetch(
        config.EXTRACT_V3_BETA_URL +
          "/v2/extract/" +
          req.params.jobId +
          "/options",
        {
          headers: {
            Authorization: `Bearer ${config.AGENT_INTEROP_SECRET}`,
          },
        },
      );

      if (optionsRequest.status !== 200) {
        logger.warn("Failed to get agent request details", {
          status: optionsRequest.status,
          method: "agentStatusController",
          module: "api/v2",
          text: await optionsRequest.text(),
        });
        model = "spark-1-pro"; // fall back to this value
      } else {
        model = ((await optionsRequest.json()).model ?? "spark-1-pro") as
          | "spark-1-pro"
          | "spark-1-mini";
      }
    } catch (error) {
      logger.warn("Failed to get agent request details", {
        error,
        method: "agentStatusController",
        module: "api/v2",
        extractId: req.params.jobId,
      });
      model = "spark-1-pro"; // fall back to this value
    }
  }

  let data: any = undefined;
  if (agent?.is_successful) {
    data = await getJobFromGCS(agent.id);
  }

  if (agent && !agent.is_successful) {
    const failedError = deserializeTransportableError(agent.error ?? "");
    return r.asyncFail(
      failedError?.code ?? CommonError.UNKNOWN,
      failedError?.message ?? agent.error ?? "Agent job failed",
      {
        expiresAt: new Date(
          new Date(agent.created_at ?? agentRequest.created_at).getTime() +
            1000 * 60 * 60 * 24,
        ).toISOString(),
        creditsUsed: agent?.credits_cost,
      },
    );
  }

  const successStatus = !agent ? "processing" : "completed";
  const body = {
    data,
    model,
    expiresAt: new Date(
      new Date(agent?.created_at ?? agentRequest.created_at).getTime() +
        1000 * 60 * 60 * 24,
    ).toISOString(),
    creditsUsed: agent?.credits_cost,
    jobState: successStatus,
  } as any;
  return successStatus === "processing" ? r.processing(body) : r.ok(body);
}
