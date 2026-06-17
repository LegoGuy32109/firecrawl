import { Response } from "express";
import { AgentCancelResponse, RequestWithAuth } from "./types";
import {
  supabaseGetAgentByIdDirect,
  supabaseGetAgentRequestByIdDirect,
} from "../../lib/supabase-jobs";
import { config } from "../../config";
import { LifecycleError } from "../../lib/error-codes";
import { errorResponse } from "./response-enveloper";

export async function agentCancelController(
  req: RequestWithAuth<{ jobId: string }, AgentCancelResponse, any>,
  res: Response<AgentCancelResponse>,
) {
  const agentRequest = await supabaseGetAgentRequestByIdDirect(
    req.params.jobId,
  );

  if (!agentRequest || agentRequest.team_id !== req.auth.team_id) {
    const response = errorResponse(
      !agentRequest
        ? LifecycleError.JOB_NOT_FOUND
        : LifecycleError.JOB_WRONG_TEAM,
      "Agent job not found",
      req,
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  const agent = await supabaseGetAgentByIdDirect(req.params.jobId);
  if (agent) {
    const response = errorResponse(
      LifecycleError.JOB_CANCELLED,
      "Agent already finished",
      req,
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  const resp = await fetch(
    config.EXTRACT_V3_BETA_URL + "/internal/extracts/" + req.params.jobId,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.AGENT_INTEROP_SECRET}`,
      },
    },
  );

  if (resp.status === 409) {
    return res.status(200).json({
      success: true,
      status: "cancelled",
    } as any);
  }

  return res.status(200).json({
    success: true,
    status: "cancelled",
  } as any);
}
