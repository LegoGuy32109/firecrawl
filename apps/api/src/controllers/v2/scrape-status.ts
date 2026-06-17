import { supabaseGetScrapeByIdOnlyData } from "../../lib/supabase-jobs";
import { getJob } from "./crawl-status";
import { logger as _logger } from "../../lib/logger";
import { getScrapeZDR } from "../../lib/zdr-helpers";
import {
  CommonError,
  LifecycleError,
  RequestError,
} from "../../lib/error-codes";
import {
  asyncJobFailureResponse,
  errorResponse,
  okResponse,
} from "./response-enveloper";
import { deserializeTransportableError } from "../../lib/error-serde";

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

export async function scrapeStatusController(req: any, res: any) {
  const uuidReg =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!req.params.jobId || !uuidReg.test(req.params.jobId)) {
    const response = errorResponse(
      RequestError.BAD_REQUEST,
      "Invalid crawl ID",
      req,
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  const logger = _logger.child({
    module: "scrape-status",
    method: "scrapeStatusController",
    teamId: req.auth.team_id,
    jobId: req.params.jobId,
    scrapeId: req.params.jobId,
    zeroDataRetention: getScrapeZDR(req.acuc?.flags) === "forced",
  });

  if (getScrapeZDR(req.acuc?.flags) === "forced") {
    const response = errorResponse(
      LifecycleError.ZDR_NOT_SUPPORTED,
      "Your team has zero data retention enabled. This is not supported on scrape status. Please contact support@firecrawl.com to unblock this feature.",
      req,
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  const job = await supabaseGetScrapeByIdOnlyData(req.params.jobId, logger);

  if (!job) {
    const response = errorResponse(
      LifecycleError.JOB_NOT_FOUND,
      "Job not found.",
      req,
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  if (job?.team_id !== req.auth.team_id) {
    const response = errorResponse(
      LifecycleError.JOB_WRONG_TEAM,
      "You are not allowed to access this resource.",
      req,
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  const jobData = await getJob(req.params.jobId, logger);
  const data = Array.isArray(jobData?.returnvalue)
    ? jobData?.returnvalue[0]
    : jobData?.returnvalue;

  if (jobData?.status === "failed") {
    const failedError = deserializeTransportableError(
      jobData.failedReason ?? "",
    );
    const response = asyncJobFailureResponse(
      failedError?.code ?? CommonError.UNKNOWN,
      failedError?.message ?? jobData.failedReason ?? "Job failed",
      req,
      {
        data,
        expiresAt: new Date(
          new Date(job.created_at).getTime() + 1000 * 60 * 60 * 24,
        ).toISOString(),
      },
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  if (!data) {
    const response = errorResponse(
      LifecycleError.JOB_NOT_FOUND,
      "Job not found.",
      req,
    );
    return res.status(response.httpStatus).json(response.body as any);
  }

  const jobState = jobData?.status === "completed" ? "completed" : "processing";
  return res.status(200).json(
    buildAsyncStatusBody(
      req,
      {
        data,
        expiresAt: new Date(
          new Date(job.created_at).getTime() + 1000 * 60 * 60 * 24,
        ).toISOString(),
      },
      jobState,
    ),
  );
}
