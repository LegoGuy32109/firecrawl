import { v7 as uuidv7 } from "uuid";
import { config } from "../../../config";
import { logger as _logger } from "../../../lib/logger";
import {
  CommonError,
  FeedbackError,
  RequestError,
  type ErrorCodes,
} from "../../../lib/error-codes";
import { errorResponse } from "../response-enveloper";
import {
  autumnService,
  featureIdForBillingEndpoint,
} from "../../../services/autumn/autumn.service";
import { captureExceptionWithZdrCheck } from "../../../services/sentry";
import {
  EndpointFeedbackErrorCode,
  RequestWithAuth,
  SearchFeedbackErrorCode,
} from "../types";
import {
  findExistingFeedback,
  insertFeedback,
  lookupFeedbackJob,
  updateFeedbackRefundDetails,
} from "./feedback-store";
import {
  FeedbackJobRow,
  FeedbackLogger,
  FeedbackRecordOptions,
  FeedbackRecordResult,
  RefundPolicySnapshot,
} from "./internal-types";
import { computeRefundPolicy } from "./refund-policy";
import { sumCreditsRefundedToday } from "./refund-totals";
import {
  shouldSkipPersistenceForForcedZdr,
  shouldSkipPersistenceForJobZdr,
} from "./zdr-persistence";

const PREVIEW_TEAM_ID = "3adefd26-77ec-5968-8dcf-c94b5630d1de";
const POSTGRES_UNIQUE_VIOLATION = "23505";
const LOOKUP_RACE_RETRY_MS = 250;
const ZDR_FEEDBACK_ID = "00000000-0000-0000-0000-000000000000";

function isPreviewTeam(teamId: string): boolean {
  return teamId === "preview" || teamId.startsWith("preview_");
}

function normalizeFeedbackTeamId(teamId: string): string {
  return isPreviewTeam(teamId) ? PREVIEW_TEAM_ID : teamId;
}

function dailyCapFor(options: FeedbackRecordOptions): number {
  return options.dailyCapCredits ?? config.FEEDBACK_DAILY_CAP_CREDITS;
}

function feedbackFailure(
  status: number,
  code: ErrorCodes,
  error: string,
  req: RequestWithAuth<any, any, any>,
  feedbackErrorCode?: EndpointFeedbackErrorCode | SearchFeedbackErrorCode,
): FeedbackRecordResult {
  const envelope = errorResponse(code, error, req, { httpStatus: status });
  const body = {
    ...envelope.body,
    ...(feedbackErrorCode ? { feedbackErrorCode } : {}),
  } as FeedbackRecordResult["body"];
  return {
    status: envelope.httpStatus,
    body,
  };
}

function zdrFeedbackSuccess(
  options: FeedbackRecordOptions,
): FeedbackRecordResult {
  return {
    status: 200,
    body: {
      success: true,
      feedbackId: ZDR_FEEDBACK_ID,
      creditsRefunded: 0,
      creditsRefundedToday: 0,
      dailyRefundCap: dailyCapFor(options),
    },
  };
}

function validateAccess(
  req: RequestWithAuth<any, any, any>,
  options: FeedbackRecordOptions,
  logger: FeedbackLogger,
): FeedbackRecordResult | null {
  if (config.USE_DB_AUTHENTICATION !== true) {
    return feedbackFailure(
      503,
      FeedbackError.DB_UNAVAILABLE,
      options.dbDisabledMessage ??
        "Feedback requires database authentication and is unavailable on this deployment.",
      req,
      "DB_DISABLED",
    );
  }

  if (isPreviewTeam(req.auth.team_id)) {
    return feedbackFailure(
      403,
      RequestError.BAD_REQUEST,
      "Feedback is not available for preview teams.",
      req,
      "PREVIEW_TEAM_NOT_ALLOWED",
    );
  }

  if (req.acuc?.flags?.searchFeedbackOptOut === true) {
    logger.info("Rejected feedback: team opted out");
    return feedbackFailure(
      403,
      FeedbackError.TEAM_OPTED_OUT,
      "Feedback is disabled for this team. Contact support@firecrawl.com to re-enable.",
      req,
      "TEAM_OPTED_OUT",
    );
  }

  return null;
}

async function lookupJobWithRetry(
  req: RequestWithAuth<any, any, any>,
  options: FeedbackRecordOptions,
  dbTeamId: string,
  logger: FeedbackLogger,
): Promise<FeedbackJobRow | FeedbackRecordResult> {
  try {
    let job = await lookupFeedbackJob(
      options.endpoint,
      options.jobId,
      dbTeamId,
    );
    if (!job) {
      await new Promise(resolve => setTimeout(resolve, LOOKUP_RACE_RETRY_MS));
      job = await lookupFeedbackJob(options.endpoint, options.jobId, dbTeamId);
    }

    if (!job) {
      return feedbackFailure(
        404,
        FeedbackError.TARGET_NOT_FOUND,
        `${options.endpoint} job not found for this team.`,
        req,
        options.notFoundCode ?? "JOB_NOT_FOUND",
      );
    }

    return job;
  } catch (error) {
    logger.error("Failed to look up job for feedback", { error });
    return feedbackFailure(
      500,
      CommonError.UNKNOWN,
      "Failed to look up job.",
      req,
      "INTERNAL",
    );
  }
}

function validateJob(
  req: RequestWithAuth<any, any, any>,
  job: FeedbackJobRow,
  options: FeedbackRecordOptions,
  logger: FeedbackLogger,
): FeedbackRecordResult | null {
  if (options.requireSuccessfulJob && job.is_successful === false) {
    return feedbackFailure(
      409,
      CommonError.UNKNOWN,
      `Cannot submit feedback for a ${options.endpoint} job that did not succeed.`,
      req,
      options.failedJobCode ?? "INTERNAL",
    );
  }

  const maxAgeSec = options.maxAgeSec ?? config.FEEDBACK_MAX_AGE_SEC;
  const createdAtMs = new Date(job.created_at).getTime();
  if (Number.isNaN(createdAtMs)) {
    logger.warn("Job row had unparseable created_at", {
      created_at: job.created_at,
    });
    return null;
  }

  if (Date.now() - createdAtMs <= maxAgeSec * 1000) return null;

  return feedbackFailure(
    409,
    FeedbackError.WINDOW_EXPIRED,
    options.windowExpiredMessage ??
      `Feedback must be submitted within ${maxAgeSec} seconds of the job.`,
    req,
    "FEEDBACK_WINDOW_EXPIRED",
  );
}

async function duplicateEndpointResponse(
  options: FeedbackRecordOptions,
  dbTeamId: string,
  logger: FeedbackLogger,
): Promise<FeedbackRecordResult> {
  const existing = await findExistingFeedback(
    dbTeamId,
    options.endpoint,
    options.jobId,
  );

  return {
    status: 200,
    body: {
      success: true,
      feedbackId: existing?.id ?? "",
      creditsRefunded: 0,
      alreadySubmitted: true,
      creditsRefundedToday: await sumCreditsRefundedToday(dbTeamId, logger),
      dailyRefundCap: dailyCapFor(options),
      warning:
        "Feedback was already submitted for this job; no additional refund issued.",
    },
  };
}

async function refundCredits(params: {
  req: RequestWithAuth<any, any, any>;
  options: FeedbackRecordOptions;
  feedbackId: string;
  cappedRefund: number;
  policy: RefundPolicySnapshot;
  logger: FeedbackLogger;
}): Promise<number> {
  const { req, options, feedbackId, cappedRefund, policy, logger } = params;
  if (cappedRefund <= 0) return 0;

  try {
    await autumnService.refundCredits({
      teamId: req.auth.team_id,
      value: cappedRefund,
      featureId:
        options.refundFeatureId ??
        featureIdForBillingEndpoint(options.endpoint),
      properties: {
        source: options.source,
        endpoint: options.endpoint,
        jobId: options.jobId,
        feedbackId,
        rating: options.feedback.rating,
        refundPolicy: policy.matchedReason,
      },
    });
    return cappedRefund;
  } catch (error) {
    logger.error("Feedback refund failed; feedback retained", { error });
    return 0;
  }
}

export async function recordEndpointFeedback(
  req: RequestWithAuth<any, any, any>,
  options: FeedbackRecordOptions,
): Promise<FeedbackRecordResult> {
  const logger = _logger.child({
    module: "api/v2",
    method: "recordEndpointFeedback",
    endpoint: options.endpoint,
    jobId: options.jobId,
    teamId: req.auth.team_id,
  });

  if (shouldSkipPersistenceForForcedZdr(req, options)) {
    logger.info("Skipping feedback persistence for forced ZDR team");
    return zdrFeedbackSuccess(options);
  }

  const accessFailure = validateAccess(req, options, logger);
  if (accessFailure) return accessFailure;

  const dbTeamId = normalizeFeedbackTeamId(req.auth.team_id);

  try {
    const jobOrFailure = await lookupJobWithRetry(
      req,
      options,
      dbTeamId,
      logger,
    );
    if ("status" in jobOrFailure) return jobOrFailure;

    if (shouldSkipPersistenceForJobZdr(jobOrFailure, options)) {
      logger.info("Skipping feedback persistence for ZDR job");
      return zdrFeedbackSuccess(options);
    }

    const jobFailure = validateJob(req, jobOrFailure, options, logger);
    if (jobFailure) return jobFailure;

    const feedbackId = uuidv7();
    const insertErr = await insertFeedback({
      feedbackId,
      options,
      job: jobOrFailure,
      dbTeamId,
      apiKeyId: req.acuc?.api_key_id ?? null,
    });

    if (insertErr) {
      if (insertErr.code === POSTGRES_UNIQUE_VIOLATION) {
        return await duplicateEndpointResponse(options, dbTeamId, logger);
      }

      logger.error("Failed to insert endpoint feedback", { error: insertErr });
      return feedbackFailure(
        500,
        CommonError.UNKNOWN,
        "Failed to record feedback.",
        req,
        "INTERNAL",
      );
    }

    const dailyCap = dailyCapFor(options);
    const refundedTodayBefore = await sumCreditsRefundedToday(dbTeamId, logger);
    const { desiredRefund, policy } = computeRefundPolicy(
      jobOrFailure,
      options.feedback.rating,
    );
    const cappedRefund = Math.min(
      desiredRefund,
      Math.max(0, dailyCap - refundedTodayBefore),
    );

    let dailyCapReached = false;
    if (desiredRefund > 0 && cappedRefund === 0) {
      dailyCapReached = true;
      logger.info(
        "Daily refund cap reached for team; feedback recorded with zero refund",
        { dailyCap, refundedTodayBefore },
      );
    }

    const creditsRefunded = await refundCredits({
      req,
      options,
      feedbackId,
      cappedRefund,
      policy,
      logger,
    });

    const updateErr = await updateFeedbackRefundDetails(
      feedbackId,
      creditsRefunded,
      policy,
    );
    if (updateErr) {
      logger.warn("Failed to persist endpoint feedback refund details", {
        error: updateErr,
        feedbackId,
        creditsRefunded,
      });
    }

    const creditsRefundedToday = refundedTodayBefore + creditsRefunded;
    dailyCapReached ||= creditsRefundedToday >= dailyCap && dailyCap > 0;

    logger.info("Endpoint feedback recorded", {
      feedbackId,
      endpoint: options.endpoint,
      creditsRefunded,
      creditsBilled: jobOrFailure.credits_cost ?? 0,
      rating: options.feedback.rating,
      issueTypes: options.feedback.issues ?? [],
      refundPolicy: policy.matchedReason,
      creditsRefundedToday,
      dailyRefundCap: dailyCap,
      dailyCapReached,
    });

    return {
      status: 200,
      body: {
        success: true,
        feedbackId,
        creditsRefunded,
        creditsRefundedToday,
        dailyRefundCap: dailyCap,
        ...(dailyCapReached
          ? {
              dailyCapReached: true,
              warning: `Daily refund cap of ${dailyCap} credits reached for this team (UTC day). Feedback was recorded; further /feedback calls today will not refund credits.`,
            }
          : {}),
      },
    };
  } catch (error) {
    captureExceptionWithZdrCheck(error);
    logger.error("Unhandled error while recording endpoint feedback", {
      error,
    });
    return feedbackFailure(
      500,
      CommonError.UNKNOWN,
      error instanceof Error ? error.message : "Unknown error",
      req,
      "INTERNAL",
    );
  }
}
