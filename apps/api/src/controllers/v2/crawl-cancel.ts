import { Response } from "express";
import { logger } from "../../lib/logger";
import {
  getCrawl,
  getCrawlJobs,
  saveCrawl,
  StoredCrawl,
} from "../../lib/crawl-redis";
import * as Sentry from "@sentry/node";
import { configDotenv } from "dotenv";
import { RequestWithAuth, scrapeOptions } from "./types";
import { crawlGroup } from "../../services/worker/nuq-router";
import { normalizeOwnerId } from "../../lib/owner-id";
import { removeConcurrencyLimitedJobs } from "../../lib/concurrency-limit";
import { CommonError, LifecycleError } from "../../lib/error-codes";
import { makeResponder } from "./response-enveloper";
configDotenv();

export async function crawlCancelController(
  req: RequestWithAuth<{ jobId: string }>,
  res: Response,
) {
  const r = makeResponder(req, res);
  try {
    const group = await crawlGroup.getGroup(req.params.jobId);
    if (!group) {
      return r.fail(LifecycleError.JOB_NOT_FOUND, "Job not found");
    }

    // group.ownerId is normalized to a UUID in NuQ, so the raw team_id
    // (e.g. "bypass" when self-hosted) must be normalized before comparing
    if (group.ownerId !== normalizeOwnerId(req.auth.team_id)) {
      return r.fail(LifecycleError.JOB_WRONG_TEAM, "Job not found");
    }

    if (group.status === "completed") {
      return r.fail(LifecycleError.JOB_CANCELLED, "Crawl is already completed");
    }

    const sc: StoredCrawl = (await getCrawl(req.params.jobId)) ?? {
      team_id: req.auth.team_id,
      createdAt: Date.now(),
      crawlerOptions: null,
      scrapeOptions: scrapeOptions.parse({}),
      internalOptions: {
        teamId: req.auth.team_id,
      },
    };

    try {
      sc.cancelled = true;
      await saveCrawl(req.params.jobId, sc);
    } catch (error) {
      logger.error(error);
    }

    if (sc.queueBackend === "fdb") {
      await crawlGroup.cancelGroup(req.params.jobId);
    } else {
      const jobIds = await getCrawlJobs(req.params.jobId);
      await removeConcurrencyLimitedJobs(sc.team_id, jobIds);
    }

    // Cancellation is a SUCCESS terminal state, not an error.
    return r.ok({ jobState: "cancelled" });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(error);
    return r.fail(
      CommonError.UNKNOWN,
      error instanceof Error ? error.message : "Unknown error",
    );
  }
}
