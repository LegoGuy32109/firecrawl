import { Response } from "express";
import { config } from "../../config";
import { RequestWithAuth } from "./types";
import {
  getExtract,
  getExtractExpiry,
  getExtractResult,
} from "../../lib/extract/extract-redis";
import {
  supabaseGetAgentByIdDirect,
  supabaseGetExtractByIdDirect,
  supabaseGetExtractRequestByIdDirect,
} from "../../lib/supabase-jobs";
import { logger as _logger } from "../../lib/logger";
import { getJobFromGCS } from "../../lib/gcs-jobs";
import { CommonError, LifecycleError } from "../../lib/error-codes";
import {
  asyncJobFailureResponse,
  errorResponse,
  okResponse,
} from "./response-enveloper";
import { deserializeTransportableError } from "../../lib/error-serde";

async function getExtractData(id: string): Promise<any> {
  // Try GCS first if configured
  if (config.GCS_BUCKET_NAME) {
    const gcsData = await getJobFromGCS(id);
    if (gcsData) {
      return Array.isArray(gcsData) ? gcsData[0] : gcsData;
    }
  }
  // Fallback to Redis
  const redisData = await getExtractResult(id);
  if (redisData) {
    return Array.isArray(redisData) ? redisData[0] : redisData;
  }
  return [];
}

function buildAsyncStatusBody(
  req: any,
  body: Record<string, unknown>,
  jobState: "processing" | "completed",
) {
  const response = okResponse(body, req).body as any;
  return {
    ...response,
    status: jobState === "processing" ? "processing" : response.status,
    jobState,
  };
}

export async function extractStatusController(
  req: RequestWithAuth<{ jobId: string }, any, any>,
  res: Response,
) {
  const extractRequest = config.USE_DB_AUTHENTICATION
    ? await supabaseGetExtractRequestByIdDirect(req.params.jobId)
    : null;
  if (config.USE_DB_AUTHENTICATION && !extractRequest) {
    const response = errorResponse(
      LifecycleError.JOB_NOT_FOUND,
      "Extract job not found",
      req,
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  if (config.USE_DB_AUTHENTICATION) {
    if (extractRequest.team_id !== req.auth.team_id) {
      const response = errorResponse(
        LifecycleError.JOB_WRONG_TEAM,
        "Extract job not found",
        req,
      );
      return res.status(response.httpStatus).json(response.body as any);
    }

    if (extractRequest.kind === "agent") {
      const agent = await supabaseGetAgentByIdDirect(req.params.jobId);

      if (agent && !agent.is_successful) {
        const failedError = deserializeTransportableError(agent.error ?? "");
        const response = asyncJobFailureResponse(
          failedError?.code ?? CommonError.UNKNOWN,
          failedError?.message ?? agent.error ?? "Extract job failed",
          req,
          {
            expiresAt: new Date(
              new Date(
                agent.created_at ?? extractRequest.created_at,
              ).getTime() +
                1000 * 60 * 60 * 24,
            ).toISOString(),
            creditsUsed: agent?.credits_cost,
          },
        );
        return res.status(response.httpStatus).json(response.body as any);
      }

      let data: any = undefined;
      if (agent?.is_successful) {
        data = await getJobFromGCS(agent.id);
      }

      const jobState = !agent ? "processing" : "completed";
      return res.status(200).json(
        buildAsyncStatusBody(
          req,
          {
            data,
            expiresAt: new Date(
              new Date(
                agent?.created_at ?? extractRequest.created_at,
              ).getTime() +
                1000 * 60 * 60 * 24,
            ).toISOString(),
            creditsUsed: agent?.credits_cost,
          },
          jobState,
        ),
      );
    }
  }

  // Get extract status from Redis (for in-progress jobs)
  const redisExtract = await getExtract(req.params.jobId);

  // If not in Redis, check the database for completed jobs
  if (!redisExtract) {
    if (config.USE_DB_AUTHENTICATION) {
      const dbExtract = await supabaseGetExtractByIdDirect(req.params.jobId);
      if (dbExtract) {
        // Get result data
        let data: any = [];
        if (dbExtract.is_successful) {
          data = await getExtractData(req.params.jobId);
        }

        if (!dbExtract.is_successful) {
          const failedError = deserializeTransportableError(
            dbExtract.error ?? "",
          );
          const response = asyncJobFailureResponse(
            failedError?.code ?? CommonError.UNKNOWN,
            failedError?.message ?? dbExtract.error ?? "Extract job failed",
            req,
            {
              expiresAt: new Date(
                new Date(dbExtract.created_at).getTime() + 1000 * 60 * 60 * 24,
              ).toISOString(),
            },
          );
          return res.status(response.httpStatus).json(response.body as any);
        }

        return res.status(200).json(
          buildAsyncStatusBody(
            req,
            {
              data,
              expiresAt: new Date(
                new Date(dbExtract.created_at).getTime() + 1000 * 60 * 60 * 24,
              ).toISOString(),
            },
            "completed",
          ),
        );
      }
    }

    // Fall back to extractRequest info
    return res.status(200).json(
      buildAsyncStatusBody(
        req,
        {
          data: [],
          expiresAt: new Date(
            new Date(extractRequest?.created_at ?? Date.now()).getTime() +
              1000 * 60 * 60 * 24,
          ).toISOString(),
        },
        "processing",
      ),
    );
  }

  // Get result data if completed
  let data: any = [];
  if (redisExtract.status === "completed") {
    data = await getExtractData(req.params.jobId);
  }

  if (redisExtract.status === "failed") {
    const failedError =
      typeof redisExtract.error === "string"
        ? deserializeTransportableError(redisExtract.error)
        : null;
    const errorMessage =
      typeof redisExtract.error === "string"
        ? redisExtract.error
        : redisExtract.error && typeof redisExtract.error === "object"
          ? typeof redisExtract.error.message === "string"
            ? redisExtract.error.message
            : typeof redisExtract.error.error === "string"
              ? redisExtract.error.error
              : JSON.stringify(redisExtract.error)
          : "Extract job failed";
    const response = asyncJobFailureResponse(
      failedError?.code ?? CommonError.UNKNOWN,
      failedError?.message ?? errorMessage,
      req,
      {
        expiresAt: (await getExtractExpiry(req.params.jobId)).toISOString(),
        creditsUsed: redisExtract.creditsBilled
          ? redisExtract.creditsBilled
          : undefined,
        data,
      },
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  return res.status(200).json(
    buildAsyncStatusBody(
      req,
      {
        data,
        expiresAt: (await getExtractExpiry(req.params.jobId)).toISOString(),
        steps: redisExtract.showSteps ? redisExtract.steps : undefined,
        llmUsage: redisExtract.showLLMUsage ? redisExtract.llmUsage : undefined,
        sources: redisExtract.showSources ? redisExtract.sources : undefined,
        costTracking: redisExtract.showCostTracking
          ? redisExtract.costTracking
          : undefined,
        sessionIds: redisExtract.sessionIds
          ? redisExtract.sessionIds
          : undefined,
        tokensUsed: redisExtract.tokensBilled
          ? redisExtract.tokensBilled
          : undefined,
        creditsUsed: redisExtract.creditsBilled
          ? redisExtract.creditsBilled
          : undefined,
      },
      redisExtract.status === "completed" ? "completed" : "processing",
    ),
  );
}
