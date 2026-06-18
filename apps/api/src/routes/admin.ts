import express from "express";
import expressWs from "express-ws";
import { config } from "../config";
import { adminIndexController } from "../admin/admin-index";
import { redisHealthController } from "../admin/redis-health";
import { autumnHealthController } from "../admin/autumn-health";
import { authMiddleware, checkCreditsMiddleware, wrap } from "./shared";
import { acucCacheClearController } from "../admin/acuc-cache-clear";
import { checkFireEngine } from "../admin/check-fire-engine";
import { cclogController } from "../admin/cclog";
import { indexQueuePrometheus } from "../admin/index-queue-prometheus";
import { triggerPrecrawl } from "../admin/precrawl";
import { metricsController, nuqMetricsController } from "../admin/metrics";
import { realtimeSearchController } from "../controllers/v2/f-search";
import { concurrencyQueueBackfillController } from "../admin/concurrency-queue-backfill";
import { crawlMonitorController } from "../admin/crawl-monitor";
import { playgroundController } from "../admin/playground/controller";
import {
  handleIntegrationAdminCreateUserProxy,
  handleIntegrationAdminRotateProxy,
  handleIntegrationAdminValidateProxy,
} from "../lib/admin-integration-integrations-proxy";
import { RateLimiterMode } from "../types";
import {
  createPlaygroundSession,
  deletePlaygroundSession,
} from "../admin/playground/session";
import { createLivecastWS } from "../services/sessionLivecastWS";

expressWs(express());

export const adminRouter = express.Router();

adminRouter.get(`/admin/${config.BULL_AUTH_KEY}`, adminIndexController);

adminRouter.get(
  `/admin/${config.BULL_AUTH_KEY}/playground`,
  playgroundController,
);

adminRouter.get(
  `/admin/${config.BULL_AUTH_KEY}/redis-health`,
  redisHealthController,
);

adminRouter.get(
  `/admin/${config.BULL_AUTH_KEY}/autumn-health`,
  autumnHealthController,
);

adminRouter.post(
  `/admin/${config.BULL_AUTH_KEY}/acuc-cache-clear`,
  wrap(acucCacheClearController),
);

adminRouter.get(
  `/admin/${config.BULL_AUTH_KEY}/feng-check`,
  wrap(checkFireEngine),
);

adminRouter.get(`/admin/${config.BULL_AUTH_KEY}/cclog`, wrap(cclogController));

adminRouter.get(
  `/admin/${config.BULL_AUTH_KEY}/index-queue-prometheus`,
  wrap(indexQueuePrometheus),
);

adminRouter.get(
  `/admin/${config.BULL_AUTH_KEY}/precrawl`,
  wrap(triggerPrecrawl),
);

adminRouter.get(
  `/admin/${config.BULL_AUTH_KEY}/metrics`,
  wrap(metricsController),
);

adminRouter.get(
  `/admin/${config.BULL_AUTH_KEY}/nuq-metrics`,
  wrap(nuqMetricsController),
);

adminRouter.post(
  `/admin/${config.BULL_AUTH_KEY}/fsearch`,
  wrap(realtimeSearchController),
);

adminRouter.post(
  `/admin/${config.BULL_AUTH_KEY}/concurrency-queue-backfill`,
  wrap(concurrencyQueueBackfillController),
);

adminRouter.post(
  `/admin/${config.BULL_AUTH_KEY}/crawl-monitor`,
  authMiddleware(RateLimiterMode.Crawl),
  checkCreditsMiddleware(2),
  wrap(crawlMonitorController),
);

adminRouter.post(
  `/admin/integration/create-user`,
  wrap(handleIntegrationAdminCreateUserProxy),
);

adminRouter.post(
  `/admin/integration/validate-api-key`,
  wrap(handleIntegrationAdminValidateProxy),
);

adminRouter.post(
  `/admin/integration/rotate-api-key`,
  wrap(handleIntegrationAdminRotateProxy),
);

adminRouter.post(
  `/admin/${config.BULL_AUTH_KEY}/playground/session`,
  wrap(createPlaygroundSession),
);

adminRouter.delete(
  `/admin/${config.BULL_AUTH_KEY}/playground/session/:id`,
  wrap(deletePlaygroundSession),
);

(adminRouter as any).ws(
  `/admin/${config.BULL_AUTH_KEY}/playground/session/:id/view`,
  createLivecastWS(req => {
    if (!config.BROWSER_SERVICE_URL) return null;
    const upstream = new URL(config.BROWSER_SERVICE_URL);
    upstream.protocol = upstream.protocol === "https:" ? "wss:" : "ws:";
    upstream.pathname = `/browsers/${req.params.id}/view/ws`;
    return upstream.toString();
  }),
);
