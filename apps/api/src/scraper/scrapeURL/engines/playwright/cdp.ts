import { z } from "zod";
import { config } from "../../../../config";
import { EngineScrapeResult } from "..";
import { Meta } from "../..";
import { robustFetch } from "../../lib/fetch";
import { getInnerJson } from "@mendable/firecrawl-rs";
import { hasFormatOfType } from "../../../../lib/format-utils";
import { ActionError } from "../../error";
import type { LiveMetadata } from "../../../../controllers/v2/types";
import type { ActionStatus } from "../../../../lib/error-details";

const actionStatusValues = new Set<ActionStatus["status"]>([
  "ok",
  "failed",
  "skipped",
  "timed_out",
]);

function normalizeActionStatus(status: string): ActionStatus["status"] {
  return actionStatusValues.has(status as ActionStatus["status"])
    ? (status as ActionStatus["status"])
    : "failed";
}

export async function scrapeURLWithPlaywrightCDP(
  meta: Meta,
): Promise<EngineScrapeResult> {
  const screenshotFormat = hasFormatOfType(meta.options.formats, "screenshot");
  const wantsScreenshot = !!screenshotFormat;
  const wantsFullPage = screenshotFormat?.fullPage ?? false;

  // Reserve a small buffer between the action-engine's budget and the outer
  // scrape abort so an action-level failure (selector miss, wait timeout,
  // executeJavascript throw) has time to be caught by playwright-service,
  // serialized with its rich SCRAPE_ACTION_ERROR envelope, and received here
  // BEFORE the outer abort collapses everything into SCRAPE_TIMEOUT. Without
  // this, when scrapeTimeout and the action timeout race they expire together
  // and the outer signal wins, losing the step-level diagnostic.
  const scrapeTimeoutMs = meta.abort.scrapeTimeout();
  const actionEngineTimeoutMs =
    scrapeTimeoutMs !== undefined
      ? Math.max(1000, scrapeTimeoutMs - 3000)
      : undefined;

  const response = await robustFetch({
    url: (config.PLAYWRIGHT_CDP_URL ?? config.PLAYWRIGHT_MICROSERVICE_URL)!,
    headers: {
      "Content-Type": "application/json",
    },
    body: {
      url: meta.rewrittenUrl ?? meta.url,
      wait_after_load: meta.options.waitFor,
      timeout: actionEngineTimeoutMs,
      headers: meta.options.headers,
      skip_tls_verification: meta.options.skipTlsVerification,
      mobile: meta.options.mobile,
      location: meta.options.location,
      ...(wantsScreenshot && {
        screenshot: true,
        full_page_screenshot: wantsFullPage,
        screenshot_quality: screenshotFormat.quality,
        screenshot_viewport: screenshotFormat.viewport,
      }),
      actions: meta.options.actions,
    },
    method: "POST",
    logger: meta.logger.child("scrapeURLWithPlaywrightCDP/robustFetch"),
    schema: z.object({
      content: z.string(),
      pageStatusCode: z.number(),
      pageError: z.string().optional(),
      contentType: z.string().optional(),
      screenshot: z.string().optional(),
      actionResults: z
        .array(
          z.union([
            z.object({ type: z.literal("scrape"), content: z.string() }),
            z.object({
              type: z.literal("screenshot"),
              screenshot: z.string(),
            }),
            z.object({
              type: z.literal("executeJavascript"),
              value: z.unknown(),
            }),
          ]),
        )
        .optional(),
      actionError: z
        .object({
          actionIndex: z.number().optional(),
          actionNumber: z.number().optional(),
          selector: z.string().optional(),
          type: z.string().optional(),
          actionType: z.string().optional(),
          message: z.string().optional(),
          actionStatuses: z
            .array(
              z.object({
                name: z.string(),
                status: z.string(),
                code: z.string().optional(),
                message: z.string().optional(),
                durationMs: z.number().optional(),
                startedAt: z.string().optional(),
                endedAt: z.string().optional(),
                details: z.record(z.string(), z.any()).optional(),
              }),
            )
            .optional(),
          pageUrl: z.string().optional(),
          screenshot: z.string().optional(),
        })
        .optional(),
      live: z
        .object({
          mode: z.enum(["single", "multi"]),
          status: z.enum(["streaming", "completed", "unavailable", "warning"]),
          scrapeId: z.string().optional(),
          liveViewUrl: z.string().optional(),
          liveViewWsUrl: z.string().optional(),
          screenshotUrl: z.string().optional(),
          recordingUrl: z.string().optional(),
          framesCaptured: z.number().optional(),
          recordingDurationMs: z.number().optional(),
          warning: z.string().optional(),
          warnings: z.array(z.any()).optional(),
          error: z
            .object({
              code: z.string().optional(),
              message: z.string(),
              details: z.record(z.string(), z.any()).optional(),
            })
            .optional(),
        })
        .optional(),
    }),
    mock: meta.mock,
    abort: meta.abort.asSignal(),
    ignoreFailureStatus: true,
  });

  if (response.actionError) {
    const actionType =
      response.actionError.actionType ?? response.actionError.type;
    throw new ActionError(
      response.actionError.message ?? "PLAYWRIGHT_ACTION_FAILED",
      response.actionError.actionIndex,
      response.actionError.actionNumber,
      response.actionError.selector,
      response.actionError.pageUrl,
      response.actionError.screenshot,
      actionType,
      response.actionError.actionStatuses?.map(status => ({
        ...status,
        status: normalizeActionStatus(status.status),
      })),
    );
  }

  if (response.contentType?.includes("application/json")) {
    response.content = await getInnerJson(response.content);
  }

  return {
    url: meta.rewrittenUrl ?? meta.url,
    html: response.content,
    statusCode: response.pageStatusCode,
    error: response.pageError,
    contentType: response.contentType,
    screenshot: response.screenshot,
    actions:
      response.actionResults === undefined
        ? undefined
        : {
            screenshots: response.actionResults
              .filter(
                (
                  x,
                ): x is {
                  type: "screenshot";
                  screenshot: string;
                } => x.type === "screenshot",
              )
              .map(x => x.screenshot),
            scrapes: response.actionResults
              .filter(
                (
                  x,
                ): x is {
                  type: "scrape";
                  content: string;
                } => x.type === "scrape",
              )
              .map(x => ({
                url: meta.rewrittenUrl ?? meta.url,
                html: x.content,
              })),
            javascriptReturns: response.actionResults
              .filter(
                (
                  x,
                ): x is {
                  type: "executeJavascript";
                  value: unknown;
                } => x.type === "executeJavascript",
              )
              .map(x => ({ type: typeof x.value, value: x.value })),
            pdfs: [],
          },
    proxyUsed: "basic",
    ...(response.live ? { live: response.live as LiveMetadata } : {}),
  };
}

export function playwrightCDPMaxReasonableTime(meta: Meta): number {
  return (meta.options.waitFor ?? 0) + 30000;
}
