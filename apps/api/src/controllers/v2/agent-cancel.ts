import { Response } from "express";
import { AgentCancelResponse, RequestWithAuth } from "./types";
import {
  supabaseGetAgentByIdDirect,
  supabaseGetAgentRequestByIdDirect,
} from "../../lib/supabase-jobs";
import { config } from "../../config";
import { LifecycleError } from "../../lib/error-codes";
import { makeResponder } from "./response-enveloper";

export async function agentCancelController(
  req: RequestWithAuth<{ jobId: string }, AgentCancelResponse, any>,
  res: Response<AgentCancelResponse>,
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
  if (agent) {
    return r.fail(LifecycleError.JOB_CANCELLED, "Agent already finished");
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
    return r.ok({
      jobState: "cancelled",
    } as any);
  }

  return r.ok({
    jobState: "cancelled",
  } as any);
}
