import type { Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { dbRr } from "../../db/connection";
import * as schema from "../../db/schema";
import { config } from "../../config";
import { RequestWithAuth } from "../../controllers/v2/types";
import {
  buildReplayContextFromScrape,
  type ScrapeContextRow,
} from "../../lib/scrape-interact/scrape-replay";
import { keylessTeamUuid } from "../../lib/keyless";

type PlaygroundScrapeSessionStatus = "active" | "destroyed" | "error";
type PlaygroundScrapeStatusLabel =
  | "Live session"
  | "Destroyed"
  | "No session"
  | "Replay unavailable";

type PlaygroundScrapeListItem = {
  id: string;
  url: string | null;
  createdAt: string;
  isSuccessful: boolean;
  error: string | null;
  actionsCount: number;
  waitForMs: number;
  creditsUsed: number;
  replayAvailable: boolean;
  replayUnavailableReason?: string;
  statusLabel: PlaygroundScrapeStatusLabel;
  session: {
    id: string;
    browserId: string;
    status: PlaygroundScrapeSessionStatus;
    createdAt: string;
    updatedAt: string;
    creditsUsed: number | null;
    liveViewUrl?: string;
  } | null;
};

type PlaygroundScrapeListResponse = {
  success: boolean;
  scrapes: PlaygroundScrapeListItem[];
};

function buildPlaygroundLiveViewUrl(browserId: string): string {
  return `/admin/${config.BULL_AUTH_KEY}/playground/session/${encodeURIComponent(browserId)}/view`;
}

function getOptions(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getActionsCount(options: Record<string, unknown>): number {
  return Array.isArray(options.actions) ? options.actions.length : 0;
}

function getWaitForMs(options: Record<string, unknown>): number {
  return typeof options.waitFor === "number" && Number.isFinite(options.waitFor)
    ? options.waitFor
    : 0;
}

export async function listPlaygroundScrapes(
  req: RequestWithAuth<{}, PlaygroundScrapeListResponse>,
  res: Response<PlaygroundScrapeListResponse>,
): Promise<void> {
  if (!config.USE_DB_AUTHENTICATION) {
    res.status(200).json({ success: true, scrapes: [] });
    return;
  }

  const requestedLimit = Number((req.query as Record<string, string>).limit);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(Math.floor(requestedLimit), 50)
      : 25;
  const expectedScrapeTeam =
    keylessTeamUuid(req.auth.team_id) ?? req.auth.team_id;

  const rows = await dbRr
    .select({
      scrape: schema.scrapes,
      session: schema.browser_sessions,
    })
    .from(schema.scrapes)
    .leftJoin(
      schema.browser_sessions,
      eq(schema.browser_sessions.scrape_id, schema.scrapes.id),
    )
    .where(eq(schema.scrapes.team_id, expectedScrapeTeam as any))
    .orderBy(
      desc(schema.scrapes.created_at),
      sql`case when ${schema.browser_sessions.status} = 'active' then 0 else 1 end`,
      desc(schema.browser_sessions.updated_at),
    )
    .limit(limit * 4);

  const byScrapeId = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byScrapeId.has(row.scrape.id)) {
      byScrapeId.set(row.scrape.id, row);
    }
    if (byScrapeId.size >= limit) break;
  }

  const scrapes = [...byScrapeId.values()].map(row => {
    const options = getOptions(row.scrape.options);
    const replay = buildReplayContextFromScrape(row.scrape as ScrapeContextRow);
    const replayAvailable = !!replay.context;
    const session = row.session;
    const statusLabel: PlaygroundScrapeStatusLabel = session
      ? session.status === "active"
        ? "Live session"
        : "Destroyed"
      : replayAvailable
        ? "No session"
        : "Replay unavailable";

    return {
      id: row.scrape.id,
      url: row.scrape.url,
      createdAt: row.scrape.created_at,
      isSuccessful: row.scrape.is_successful,
      error: row.scrape.error,
      actionsCount: getActionsCount(options),
      waitForMs: getWaitForMs(options),
      creditsUsed: row.scrape.credits_cost,
      replayAvailable,
      ...(replay.error ? { replayUnavailableReason: replay.error } : {}),
      statusLabel,
      session: session
        ? {
            id: session.id,
            browserId: session.browser_id,
            status: session.status as PlaygroundScrapeSessionStatus,
            createdAt: session.created_at,
            updatedAt: session.updated_at,
            creditsUsed: session.credits_used,
            ...(session.status === "active"
              ? { liveViewUrl: buildPlaygroundLiveViewUrl(session.browser_id) }
              : {}),
          }
        : null,
    };
  });

  res.status(200).json({
    success: true,
    scrapes,
  });
}
