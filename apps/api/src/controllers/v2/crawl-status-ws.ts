import { RateLimiterMode } from "../../types";
import { authenticateUser } from "../auth";
import {
  CrawlStatusParams,
  CrawlStatusResponse,
  Document,
  RequestWithAuth,
} from "./types";
import { WebSocket } from "ws";
import { v7 as uuidv7 } from "uuid";
import { logger } from "../../lib/logger";
import {
  getCrawl,
  getCrawlError,
  getCrawlExpiry,
  getCrawlJobs,
  getDoneJobsOrdered,
} from "../../lib/crawl-redis";
import { getJobs, PseudoJob } from "./crawl-status";
import * as Sentry from "@sentry/node";
import { getConcurrencyLimitedJobs } from "../../lib/concurrency-limit";
import { scrapeQueue, NuQJobStatus } from "../../services/worker/nuq-router";
import { getErrorContactMessage } from "../../lib/deployment";
import { asyncJobFailureResponse, okResponse } from "./response-enveloper";
import { CommonError, LifecycleError } from "../../lib/error-codes";
import { explainError } from "../../lib/error-catalog";
import { deserializeTransportableError } from "../../lib/error-serde";

type ErrorMessage = {
  type: "error";
  error: string;
};

type CatchupMessage = {
  type: "catchup";
  data: CrawlStatusResponse;
};

type DocumentMessage = {
  type: "document";
  data: Document;
};

type DoneMessage = { type: "done" };

type Message = ErrorMessage | CatchupMessage | DoneMessage | DocumentMessage;

function buildAsyncStatusBody(
  req: RequestWithAuth<CrawlStatusParams, undefined, undefined>,
  body: Record<string, unknown>,
  jobState: "processing" | "completed" | "cancelled" | "failed",
) {
  const response = okResponse(body, req).body as any;
  return {
    ...response,
    status:
      jobState === "processing" || jobState === "failed"
        ? jobState
        : response.status,
    jobState,
  };
}

function send(ws: WebSocket, msg: Message) {
  if (ws.readyState === 1) {
    return new Promise((resolve, reject) => {
      ws.send(JSON.stringify(msg), err => {
        if (err) reject(err);
        else resolve(null);
      });
    });
  }
}

function close(ws: WebSocket, code: number, msg: Message) {
  if (ws.readyState <= 1) {
    ws.close(code, JSON.stringify(msg));
  }
}

async function crawlStatusWS(
  ws: WebSocket,
  req: RequestWithAuth<CrawlStatusParams, undefined, undefined>,
) {
  const sc = await getCrawl(req.params.jobId);
  if (!sc) {
    const code = LifecycleError.JOB_NOT_FOUND;
    const entry = explainError(code);
    return close(ws, 1008, {
      type: "error",
      error: entry.explanation,
    });
  }

  if (sc.team_id !== req.auth.team_id) {
    const code = LifecycleError.JOB_WRONG_TEAM;
    const entry = explainError(code);
    return close(ws, 3003, { type: "error", error: entry.explanation });
  }

  let doneJobIDs: string[] = [];
  let finished = false;

  const loop = async () => {
    if (finished) return;

    const jobIDs = await getCrawlJobs(req.params.jobId);

    if (jobIDs.length === doneJobIDs.length) {
      return close(ws, 1000, { type: "done" });
    }

    const notDoneJobIDs = jobIDs.filter(x => !doneJobIDs.includes(x));

    const newlyDoneJobIDs: string[] = (
      await scrapeQueue.getJobsWithStatuses(notDoneJobIDs, [
        "completed",
        "failed",
      ])
    ).map(x => x.id);

    const newlyDoneJobs: PseudoJob<any>[] = await getJobs(
      newlyDoneJobIDs,
      logger,
    );

    for (const job of newlyDoneJobs) {
      if (job.returnvalue) {
        send(ws, {
          type: "document",
          data: job.returnvalue,
        });
      } else {
        // Crawl errors are ignored.
      }
    }

    doneJobIDs.push(...newlyDoneJobIDs);
    setTimeout(loop, 1000);
  };

  setTimeout(loop, 1000);

  let [_doneJobIDs, jobIDs, throttledJobsSet] = await Promise.all([
    getDoneJobsOrdered(req.params.jobId),
    getCrawlJobs(req.params.jobId),
    getConcurrencyLimitedJobs(req.auth.team_id),
  ]);

  doneJobIDs = _doneJobIDs;
  const jobs = new Map((await scrapeQueue.getJobs(jobIDs)).map(x => [x.id, x]));

  const validJobStatuses: [string, NuQJobStatus][] = [];
  const validJobIDs: string[] = [];

  for (const id of jobIDs) {
    if (throttledJobsSet.has(id)) {
      validJobStatuses.push([id, "queued"]);
      validJobIDs.push(id);
    } else {
      const job = jobs.get(id);
      if (job && job.status !== "failed") {
        validJobStatuses.push([id, job.status]);
        validJobIDs.push(id);
      }
    }
  }

  // Check if the crawl failed during kickoff (e.g. queue full)
  const crawlError = await getCrawlError(req.params.jobId);

  let status: "scraping" | "completed" | "failed" | "cancelled" = sc.cancelled
    ? "cancelled"
    : validJobStatuses.every(x => x[1] === "completed")
      ? "completed"
      : "scraping";

  if (crawlError && jobIDs.length === 0 && status === "completed") {
    status = "failed";
  }

  const jobState: "processing" | "completed" | "cancelled" | "failed" =
    status === "scraping"
      ? "processing"
      : (status as "completed" | "cancelled" | "failed");

  jobIDs = validJobIDs; // Use validJobIDs instead of jobIDs for further processing

  const doneJobs = await getJobs(doneJobIDs, logger);
  const data = doneJobs.map(x => x.returnvalue);

  if (jobState === "failed" && crawlError) {
    const failedError = deserializeTransportableError(crawlError);
    const failure = asyncJobFailureResponse<Document[]>(
      failedError?.code ?? CommonError.UNKNOWN,
      failedError?.message ?? crawlError,
      req,
      {
        data: [],
        failureCount: 1,
        failuresByCode: {
          [failedError?.code ?? CommonError.UNKNOWN]: 1,
        },
        creditsUsed: 0,
        expiresAt: (await getCrawlExpiry(req.params.jobId)).toISOString(),
      },
    );

    await send(ws, {
      type: "catchup",
      data: {
        ...failure.body,
        total: 0,
        completed: 0,
      },
    });
    finished = true;
    return close(ws, 1000, { type: "done" });
  }

  const terminalJobState =
    jobState === "processing"
      ? "processing"
      : (jobState as "completed" | "cancelled");

  await send(ws, {
    type: "catchup",
    data: buildAsyncStatusBody(
      req,
      {
        total: jobIDs.length,
        completed: doneJobIDs.length,
        creditsUsed: jobIDs.length,
        expiresAt: (await getCrawlExpiry(req.params.jobId)).toISOString(),
        data,
      },
      terminalJobState,
    ),
  });

  if (jobState !== "processing") {
    finished = true;
    return close(ws, 1000, { type: "done" });
  }
}

// Basically just middleware and error wrapping
export async function crawlStatusWSController(
  ws: WebSocket,
  req: RequestWithAuth<CrawlStatusParams, undefined, undefined>,
) {
  try {
    const auth = await authenticateUser(req, null, RateLimiterMode.CrawlStatus);

    if (!auth.success) {
      return close(ws, 3000, {
        type: "error",
        error: auth.error,
      });
    }

    const { team_id, org_id } = auth;

    req.auth = { team_id, org_id };

    await crawlStatusWS(ws, req);
  } catch (err) {
    Sentry.captureException(err);

    const id = uuidv7();
    let verbose = JSON.stringify(err);
    if (verbose === "{}") {
      if (err instanceof Error) {
        verbose = JSON.stringify({
          message: err.message,
          name: err.name,
          stack: err.stack,
        });
      }
    }

    logger.error(
      "Error occurred in WebSocket! (" +
        req.path +
        ") -- ID " +
        id +
        " -- " +
        verbose,
    );
    return close(ws, 1011, {
      type: "error",
      error: getErrorContactMessage(id),
    });
  }
}
