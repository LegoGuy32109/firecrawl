import { supabaseGetScrapeByIdOnlyData } from "../../lib/supabase-jobs";
import { getJob } from "./crawl-status";
import { logger as _logger } from "../../lib/logger";
import { getScrapeZDR } from "../../lib/zdr-helpers";
import {
  CommonError,
  LifecycleError,
  RequestError,
} from "../../lib/error-codes";
import { makeResponder } from "./response-enveloper";
import { deserializeTransportableError } from "../../lib/error-serde";

export async function scrapeStatusController(req: any, res: any) {
  const r = makeResponder(req, res);
  const uuidReg =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!req.params.jobId || !uuidReg.test(req.params.jobId)) {
    return r.fail(RequestError.BAD_REQUEST, "Invalid crawl ID");
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
    return r.fail(
      LifecycleError.ZDR_NOT_SUPPORTED,
      "Your team has zero data retention enabled. This is not supported on scrape status. Please contact support@firecrawl.com to unblock this feature.",
    );
  }

  const job = await supabaseGetScrapeByIdOnlyData(req.params.jobId, logger);

  if (!job) {
    return r.fail(LifecycleError.JOB_NOT_FOUND, "Job not found.");
  }

  if (job?.team_id !== req.auth.team_id) {
    return r.fail(
      LifecycleError.JOB_WRONG_TEAM,
      "You are not allowed to access this resource.",
    );
  }

  const jobData = await getJob(req.params.jobId, logger);
  const data = Array.isArray(jobData?.returnvalue)
    ? jobData?.returnvalue[0]
    : jobData?.returnvalue;

  if (jobData?.status === "failed") {
    const failedError = deserializeTransportableError(
      jobData.failedReason ?? "",
    );
    return r.asyncFail(
      failedError?.code ?? CommonError.UNKNOWN,
      failedError?.message ?? jobData.failedReason ?? "Job failed",
      {
        data,
        expiresAt: new Date(
          new Date(job.created_at).getTime() + 1000 * 60 * 60 * 24,
        ).toISOString(),
      },
    );
  }

  if (!data) {
    return r.fail(LifecycleError.JOB_NOT_FOUND, "Job not found.");
  }

  const body = {
    data,
    expiresAt: new Date(
      new Date(job.created_at).getTime() + 1000 * 60 * 60 * 24,
    ).toISOString(),
    jobState: jobData?.status === "completed" ? "completed" : "processing",
  };
  return jobData?.status === "completed" ? r.ok(body) : r.processing(body);
}
