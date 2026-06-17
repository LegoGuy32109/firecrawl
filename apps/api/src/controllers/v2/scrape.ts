import { Response } from "express";
import { config } from "../../config";
import { logger as _logger } from "../../lib/logger";
import {
  Document,
  FormatObject,
  RequestWithAuth,
  ScrapeRequest,
  scrapeRequestSchema,
  ScrapeResponse,
} from "./types";
import { v7 as uuidv7 } from "uuid";
import { hasFormatOfType } from "../../lib/format-utils";
import { TransportableError } from "../../lib/error";
import {
  AgentError,
  BillingError,
  CommonError,
  RequestError,
  ScrapeError,
  type ErrorCodes,
} from "../../lib/error-codes";
import { errorCodeToHttpStatus } from "../../lib/error-catalog";
import { NuQJob } from "../../services/worker/nuq";
import { checkPermissions } from "../../lib/permissions";
import { withSpan, setSpanAttributes, SpanKind } from "../../lib/otel-tracer";
import { processJobInternal } from "../../services/worker/scrape-worker";
import { ScrapeJobData } from "../../types";
import { teamConcurrencySemaphore } from "../../services/worker/team-semaphore";
import { getJobPriority } from "../../lib/job-priority";
import { logRequest } from "../../services/logging/log_job";
import { getErrorContactMessage } from "../../lib/deployment";
import { captureExceptionWithZdrCheck } from "../../services/sentry";
import type { BillingMetadata } from "../../services/billing/types";
import { getScrapeZDR } from "../../lib/zdr-helpers";
import { errorResponse } from "./response-enveloper";
import {
  KEYLESS_CREDITS_MESSAGE,
  adjustKeylessCredits,
  logKeylessCreditUsage,
  reserveKeylessCredits,
} from "../../lib/keyless";
import { projectScrapeCredits } from "../../lib/keyless-credit-projection";
import { applyAgentAuthDiscoveryHeader } from "../../lib/agent-auth-discovery";

const AGENT_INTEROP_CONCURRENCY_BOOST = 3;

type PrivacyMode = "disabled" | "allowed" | "forced" | "request";

function buildDiagnostics(
  traceId: string,
  zeroDataRetention: boolean,
  mode: PrivacyMode,
) {
  return {
    privacy: {
      zeroDataRetention,
      mode,
      reduced: false,
    },
    traceId,
  };
}

function getPrivacyMode(
  zeroDataRetention: boolean,
  requestZeroDataRetention: boolean,
  forcedByTeam: boolean,
): PrivacyMode {
  if (forcedByTeam) {
    return "forced";
  }

  if (requestZeroDataRetention) {
    return "request";
  }

  return zeroDataRetention ? "allowed" : "disabled";
}

function jsonResponse(res: Response, statusCode: number, body: unknown) {
  return res.status(statusCode).json(body as any);
}

function sendErrorResponse(
  res: Response,
  code: ErrorCodes,
  error: string | Error,
  ctx: {
    traceId?: string;
    zeroDataRetention?: boolean;
    privacyMode: PrivacyMode;
  },
  opts: Parameters<typeof errorResponse>[3] = {},
) {
  const envelope = errorResponse(code, error, ctx, opts);
  return jsonResponse(res, envelope.httpStatus, envelope.body);
}

export async function scrapeController(
  req: RequestWithAuth<{}, ScrapeResponse, ScrapeRequest>,
  res: Response<ScrapeResponse>,
) {
  return withSpan(
    "api.scrape.request",
    async span => {
      // Get timing data from middleware (includes all middleware processing time)
      const middlewareStartTime =
        (req as any).requestTiming?.startTime || new Date().getTime();
      const controllerStartTime = new Date().getTime();

      const jobId = uuidv7();
      const forcedByTeam = getScrapeZDR(req.acuc?.flags) === "forced";
      const preNormalizedBody = { ...req.body };
      const zeroDataRetention =
        forcedByTeam || (req.body.zeroDataRetention ?? false) || false;
      const effectiveZeroDataRetention =
        zeroDataRetention || (req.body.lockdown ?? false);
      const diagnostics = buildDiagnostics(
        jobId,
        effectiveZeroDataRetention,
        getPrivacyMode(
          effectiveZeroDataRetention,
          req.body.zeroDataRetention ?? false,
          forcedByTeam,
        ),
      );

      // Set initial span attributes
      setSpanAttributes(span, {
        "scrape.job_id": jobId,
        "scrape.url": req.body.url,
        "scrape.team_id": req.auth.team_id,
        "scrape.api_key_id": req.acuc?.api_key_id,
        "scrape.middleware_time_ms": controllerStartTime - middlewareStartTime,
      });

      // Validation span
      await withSpan("api.scrape.validate", async validateSpan => {
        req.body = scrapeRequestSchema.parse(req.body);
        setSpanAttributes(validateSpan, {
          "validation.success": true,
        });
      });

      // Permission check span
      const permissions = await withSpan(
        "api.scrape.check_permissions",
        async permSpan => {
          const perms = checkPermissions(req.body, req.acuc?.flags);
          setSpanAttributes(permSpan, {
            "permissions.success": !perms.error,
            "permissions.error": perms.error,
          });
          return perms;
        },
      );

      if (permissions.error) {
        setSpanAttributes(span, {
          "scrape.error": permissions.error,
          "scrape.status_code": 403,
        });
        return sendErrorResponse(
          res,
          RequestError.BAD_REQUEST,
          permissions.error,
          {
            traceId: jobId,
            zeroDataRetention: effectiveZeroDataRetention,
            privacyMode: getPrivacyMode(
              effectiveZeroDataRetention,
              req.body.zeroDataRetention ?? false,
              forcedByTeam,
            ),
          },
          { httpStatus: 403 },
        );
      }

      const billing: BillingMetadata = req.body.__agentInterop
        ? { endpoint: "agent" as const, jobId }
        : { endpoint: "scrape" as const, jobId };

      if (
        req.body.__agentInterop &&
        config.AGENT_INTEROP_SECRET &&
        req.body.__agentInterop.auth !== config.AGENT_INTEROP_SECRET
      ) {
        return sendErrorResponse(
          res,
          RequestError.BAD_REQUEST,
          "Invalid agent interop.",
          {
            traceId: jobId,
            zeroDataRetention: effectiveZeroDataRetention,
            privacyMode: getPrivacyMode(
              effectiveZeroDataRetention,
              req.body.zeroDataRetention ?? false,
              forcedByTeam,
            ),
          },
          { httpStatus: 403 },
        );
      } else if (req.body.__agentInterop && !config.AGENT_INTEROP_SECRET) {
        return sendErrorResponse(
          res,
          RequestError.BAD_REQUEST,
          "Agent interop is not enabled.",
          {
            traceId: jobId,
            zeroDataRetention: effectiveZeroDataRetention,
            privacyMode: getPrivacyMode(
              effectiveZeroDataRetention,
              req.body.zeroDataRetention ?? false,
              forcedByTeam,
            ),
          },
          { httpStatus: 403 },
        );
      }

      const shouldBill = req.body.__agentInterop?.shouldBill ?? true;
      const agentRequestId = req.body.__agentInterop?.requestId ?? null;
      const boostConcurrency =
        req.body.__agentInterop?.boostConcurrency ?? false;
      const isDirectToBullMQ =
        config.SEARCH_PREVIEW_TOKEN !== undefined &&
        config.SEARCH_PREVIEW_TOKEN === req.body.__searchPreviewToken;
      const projectedKeylessCredits =
        shouldBill && !isDirectToBullMQ
          ? projectScrapeCredits(
              req.body,
              req.acuc?.flags ?? null,
              effectiveZeroDataRetention,
            )
          : 0;
      let reservedKeylessCredits = 0;
      let reconciledKeylessCredits = false;

      if (projectedKeylessCredits > 0) {
        const reservation = await reserveKeylessCredits(
          req.auth.team_id,
          projectedKeylessCredits,
        );
        if (!reservation.ok) {
          applyAgentAuthDiscoveryHeader(res);
          return sendErrorResponse(
            res,
            BillingError.INSUFFICIENT_CREDITS,
            KEYLESS_CREDITS_MESSAGE,
            {
              traceId: jobId,
              zeroDataRetention: effectiveZeroDataRetention,
              privacyMode: getPrivacyMode(
                effectiveZeroDataRetention,
                req.body.zeroDataRetention ?? false,
                forcedByTeam,
              ),
            },
            { httpStatus: 429 },
          );
        }
        reservedKeylessCredits = projectedKeylessCredits;
      }

      const logger = _logger.child({
        method: "scrapeController",
        jobId,
        noq: true,
        scrapeId: jobId,
        teamId: req.auth.team_id,
        team_id: req.auth.team_id,
        zeroDataRetention: effectiveZeroDataRetention,
      });

      const middlewareTime = controllerStartTime - middlewareStartTime;

      logger.debug("Scrape " + jobId + " starting", {
        version: "v2",
        scrapeId: jobId,
        request: req.body,
        originalRequest: preNormalizedBody,
        account: req.account,
      });

      let logRequestPromise: Promise<any> | undefined = undefined;

      if (!agentRequestId) {
        logRequestPromise = logRequest({
          id: jobId,
          kind: "scrape",
          api_version: "v2",
          team_id: req.auth.team_id,
          origin: req.body.origin ?? "api",
          integration: req.body.integration,
          target_hint: req.body.url,
          zeroDataRetention: effectiveZeroDataRetention,
          api_key_id: req.acuc?.api_key_id ?? null,
        }).catch(err =>
          logger.warn("Background request log failed", { error: err, jobId }),
        );
      }

      setSpanAttributes(span, {
        "scrape.zero_data_retention": effectiveZeroDataRetention,
        "scrape.origin": req.body.origin,
        "scrape.timeout": req.body.timeout,
      });

      const origin = req.body.origin;
      const timeout = req.body.timeout;

      const totalWait =
        (req.body.waitFor ?? 0) +
        (req.body.actions ?? []).reduce(
          (a, x) => (x.type === "wait" ? (x.milliseconds ?? 0) : 0) + a,
          0,
        );

      let lockTime: number | null = null;
      let concurrencyLimited: boolean = false;

      let timeoutHandle: NodeJS.Timeout | null = null;
      let doc: Document | null = null;

      try {
        const lockStart = Date.now();
        const aborter = new AbortController();
        if (timeout) {
          // Semaphore has 2/3 of the timeout time to get a lock to allow for scrape time
          timeoutHandle = setTimeout(() => {
            aborter.abort();
          }, timeout * 0.667);
        }
        req.on("close", () => aborter.abort());

        const baseConcurrency = req.acuc?.concurrency || 1;
        const concurrency = boostConcurrency
          ? baseConcurrency * AGENT_INTEROP_CONCURRENCY_BOOST
          : baseConcurrency;

        doc = await teamConcurrencySemaphore.withSemaphore(
          req.auth.team_id,
          jobId,
          concurrency,
          aborter.signal,
          timeout ?? 60_000,
          async limited => {
            const jobPriority = await getJobPriority({
              team_id: req.auth.team_id,
              basePriority: 10,
            });

            lockTime = Date.now() - lockStart;
            concurrencyLimited = limited;

            logger.debug(`Lock acquired for team: ${req.auth.team_id}`, {
              teamId: req.auth.team_id,
              lockTime,
              limited,
            });

            // Wait for job completion span
            const doc = await withSpan(
              "api.scrape.wait_for_job",
              async waitSpan => {
                setSpanAttributes(waitSpan, {
                  "wait.timeout":
                    timeout !== undefined ? timeout + totalWait : undefined,
                  "wait.job_id": jobId,
                });

                const job: NuQJob<ScrapeJobData> = {
                  id: jobId,

                  status: "active",
                  createdAt: new Date(),
                  priority: jobPriority,
                  data: {
                    url: req.body.url,
                    mode: "single_urls",
                    team_id: req.auth.team_id,
                    scrapeOptions: {
                      ...req.body,
                      ...((req.body as any).__experimental_cache
                        ? {
                            maxAge: req.body.maxAge ?? 4 * 60 * 60 * 1000, // 4 hours
                          }
                        : {}),
                    },
                    internalOptions: {
                      teamId: req.auth.team_id,
                      saveScrapeResultToGCS: process.env
                        .GCS_FIRE_ENGINE_BUCKET_NAME
                        ? true
                        : false,
                      unnormalizedSourceURL: preNormalizedBody.url,
                      bypassBilling: isDirectToBullMQ || !shouldBill,
                      zeroDataRetention: effectiveZeroDataRetention,
                      teamFlags: req.acuc?.flags ?? null,
                      agentIndexOnly: (req as any).agentIndexOnly ?? false,
                    },
                    skipNuq: true,
                    origin,
                    integration: req.body.integration,
                    billing,
                    startTime: controllerStartTime,
                    zeroDataRetention: effectiveZeroDataRetention,
                    apiKeyId: req.acuc?.api_key_id ?? null,
                    concurrencyLimited: limited,
                    keylessReserved: reservedKeylessCredits > 0,
                    requestId: agentRequestId ?? undefined,
                    logRequestPromise: logRequestPromise,
                  },
                };

                const result = await processJobInternal(job);

                setSpanAttributes(waitSpan, {
                  "wait.success": true,
                });

                return result ?? null;
              },
            );

            return doc;
          },
        );
      } catch (e) {
        if (reservedKeylessCredits > 0 && !reconciledKeylessCredits) {
          reconciledKeylessCredits = true;
          adjustKeylessCredits(req.auth.team_id, -reservedKeylessCredits).catch(
            () => {},
          );
        }

        const timeoutErr =
          e instanceof TransportableError && e.code === ScrapeError.TIMEOUT;

        setSpanAttributes(span, {
          "scrape.error": e instanceof Error ? e.message : String(e),
          "scrape.error_type":
            e instanceof TransportableError ? e.code : "unknown",
        });

        if (e instanceof TransportableError) {
          if (!timeoutErr) {
            logger.error(`Error in scrapeController`, {
              version: "v2",
              error: e,
            });
          }
          // DNS resolution errors should return 200 with success: false
          if (e.code === ScrapeError.DNS) {
            setSpanAttributes(span, {
              "scrape.status_code": 200,
            });
            return sendErrorResponse(
              res,
              e.code,
              e.message,
              {
                traceId: jobId,
                zeroDataRetention: effectiveZeroDataRetention,
                privacyMode: getPrivacyMode(
                  effectiveZeroDataRetention,
                  req.body.zeroDataRetention ?? false,
                  forcedByTeam,
                ),
              },
              { httpStatus: 200 },
            );
          }

          const statusCode = errorCodeToHttpStatus(e.code);
          setSpanAttributes(span, {
            "scrape.status_code": statusCode,
          });
          return sendErrorResponse(
            res,
            e.code,
            e.message,
            {
              traceId: jobId,
              zeroDataRetention: effectiveZeroDataRetention,
              privacyMode: getPrivacyMode(
                effectiveZeroDataRetention,
                req.body.zeroDataRetention ?? false,
                forcedByTeam,
              ),
            },
            e.code === AgentError.INDEX_ONLY
              ? {
                  httpStatus: statusCode,
                  sponsor_status: "pending",
                  login_url: "https://firecrawl.dev/signin",
                }
              : { httpStatus: statusCode },
          );
        } else {
          const id = uuidv7();
          logger.error(`Error in scrapeController`, {
            version: "v2",
            error: e,
            errorId: id,
            path: req.path,
            teamId: req.auth.team_id,
          });
          captureExceptionWithZdrCheck(e, {
            tags: {
              errorId: id,
              version: "v2",
              teamId: req.auth.team_id,
            },
            extra: {
              path: req.path,
              url: req.body.url,
            },
            zeroDataRetention: effectiveZeroDataRetention,
          });
          setSpanAttributes(span, {
            "scrape.status_code": 500,
            "scrape.error_id": id,
          });
          return sendErrorResponse(
            res,
            CommonError.UNKNOWN,
            getErrorContactMessage(id),
            {
              traceId: jobId,
              zeroDataRetention: effectiveZeroDataRetention,
              privacyMode: getPrivacyMode(
                effectiveZeroDataRetention,
                req.body.zeroDataRetention ?? false,
                forcedByTeam,
              ),
            },
            { httpStatus: 500, errorId: id },
          );
        }
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      }

      if (!hasFormatOfType(req.body.formats, "rawHtml")) {
        if (doc && doc.rawHtml) {
          delete doc.rawHtml;
        }
      }

      if (reservedKeylessCredits > 0 && !reconciledKeylessCredits) {
        reconciledKeylessCredits = true;
        const actualKeylessCredits = doc?.metadata?.creditsUsed ?? 0;
        adjustKeylessCredits(
          req.auth.team_id,
          actualKeylessCredits - reservedKeylessCredits,
        ).catch(() => {});
        logKeylessCreditUsage(req.auth.team_id, actualKeylessCredits).catch(
          () => {},
        );
      }

      const totalRequestTime = new Date().getTime() - middlewareStartTime;
      const controllerTime = new Date().getTime() - controllerStartTime;

      // Set final span attributes
      setSpanAttributes(span, {
        "scrape.success": true,
        "scrape.status_code": 200,
        "scrape.total_request_time_ms": totalRequestTime,
        "scrape.controller_time_ms": controllerTime,
        "scrape.total_wait_time_ms": totalWait,
        "scrape.document.status_code": doc?.metadata?.statusCode,
        "scrape.document.content_type": doc?.metadata?.contentType,
        "scrape.document.error": doc?.metadata?.error,
      });

      let usedLlm =
        !!hasFormatOfType(req.body.formats, "json") ||
        !!hasFormatOfType(req.body.formats, "summary") ||
        !!hasFormatOfType(req.body.formats, "branding") ||
        !!hasFormatOfType(req.body.formats, "question") ||
        !!hasFormatOfType(req.body.formats, "highlights") ||
        !!hasFormatOfType(req.body.formats, "query");

      if (!usedLlm) {
        const ct = hasFormatOfType(req.body.formats, "changeTracking");

        if (ct && ct.modes?.includes("json")) {
          usedLlm = true;
        }
      }

      const formats: string[] =
        req.body.formats?.map((f: FormatObject) => f?.type) ?? [];

      logger.info("Request metrics", {
        version: "v2",
        scrapeId: jobId,
        mode: "scrape",
        middlewareStartTime,
        controllerStartTime,
        middlewareTime,
        controllerTime,
        totalRequestTime,
        totalWait,
        usedLlm,
        formats,
        concurrencyLimited,
        concurrencyQueueDurationMs: lockTime || undefined,
      });

      return jsonResponse(res, 200, {
        success: true,
        status: "ok",
        diagnostics,
        data: {
          ...doc!,
          metadata: {
            ...doc!.metadata,
            concurrencyLimited,
            concurrencyQueueDurationMs: concurrencyLimited
              ? lockTime || 0
              : undefined,
          },
        },
        scrape_id: origin?.includes("website") ? jobId : undefined,
      });
    },
    {
      attributes: {
        "http.method": "POST",
        "http.route": "/v2/scrape",
      },
      kind: SpanKind.SERVER,
    },
  );
}
