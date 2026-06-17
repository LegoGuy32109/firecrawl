import crypto from "crypto";
import request from "./lib";
import WebSocket from "ws";
import { config } from "../../../config";
import {
  ALLOW_TEST_SUITE_WEBSITE,
  HAS_FIRE_ENGINE,
  HAS_PLAYWRIGHT,
  TEST_PRODUCTION,
  TEST_SELF_HOST,
  TEST_SUITE_WEBSITE,
  itIf,
} from "../lib";
import {
  Identity,
  idmux,
  scrapeStopInteractiveBrowserRaw,
  scrapeInteractRaw,
  scrapeRaw,
  scrapeTimeout,
  TEST_API_URL,
} from "./lib";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForFirstFrame(wsUrl: string, timeoutMs: number = 15000) {
  return await new Promise<any>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Timed out waiting for live frame"));
    }, timeoutMs);

    socket.on("message", data => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === "frame") {
          clearTimeout(timeout);
          socket.close();
          resolve(payload);
        }
      } catch {}
    });

    socket.on("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function interactWithReplicaRetry(
  jobId: string,
  body: {
    code: string;
    language?: "python" | "node" | "bash";
    timeout?: number;
  },
  identity: Identity,
  attempts: number = 5,
) {
  let lastResponse: Awaited<ReturnType<typeof scrapeInteractRaw>> | null = null;

  for (let i = 0; i < attempts; i += 1) {
    const response = await scrapeInteractRaw(jobId, body, identity);
    lastResponse = response;
    if (response.statusCode !== 404) return response;
    await sleep(500);
  }

  return lastResponse!;
}

describe("Scrape browser interact replay", () => {
  let identity: Identity;
  let otherIdentity: Identity;

  beforeAll(async () => {
    identity = await idmux({
      name: "scrape-browser-replay",
      concurrency: 20,
      credits: 1_000_000,
    });
    otherIdentity = await idmux({
      name: "scrape-browser-replay-other",
      concurrency: 10,
      credits: 1_000_000,
    });
  }, 10000 + scrapeTimeout);

  const canRunReplayHappyPath =
    ALLOW_TEST_SUITE_WEBSITE &&
    !!config.BROWSER_SERVICE_URL &&
    (TEST_PRODUCTION || HAS_FIRE_ENGINE);

  itIf(canRunReplayHappyPath)(
    "replays scrape URL/waitFor/actions before interactive code runs",
    async () => {
      const marker = crypto.randomUUID();
      const url = `${TEST_SUITE_WEBSITE}?testId=${crypto.randomUUID()}`;
      let scrapeId: string | null = null;

      try {
        const scrapeResponse = await scrapeRaw(
          {
            url,
            origin: "website-replay-test",
            waitFor: 500,
            actions: [
              {
                type: "executeJavascript",
                script: `window.__firecrawlReplayMarker = "${marker}";`,
              },
            ],
          },
          identity,
        );

        expect(scrapeResponse.statusCode).toBe(200);
        expect(scrapeResponse.body.success).toBe(true);
        expect(typeof scrapeResponse.body.scrape_id).toBe("string");
        scrapeId = scrapeResponse.body.scrape_id as string;

        const executeResponse = await interactWithReplicaRetry(
          scrapeId,
          {
            language: "node",
            timeout: 60,
            code: `
              const replayMarker = await page.evaluate(() => window.__firecrawlReplayMarker ?? null);
              console.log(replayMarker ?? "missing-marker");
            `,
          },
          identity,
        );

        expect(executeResponse.statusCode).toBe(200);
        expect(executeResponse.body.success).toBe(true);
        expect(executeResponse.body.stdout).toContain(marker);
        expect(executeResponse.body.live).toMatchObject({
          status: "streaming",
        });
      } finally {
        if (scrapeId) {
          const stopResponse = await scrapeStopInteractiveBrowserRaw(
            scrapeId,
            identity,
          );
          expect(stopResponse.statusCode).toBe(200);
          expect(stopResponse.body.live).toMatchObject({
            status: "completed",
          });
          expect(stopResponse.body.sessionDurationMs).toEqual(
            expect.any(Number),
          );
        }
      }
    },
    scrapeTimeout,
  );

  itIf(ALLOW_TEST_SUITE_WEBSITE && !!config.BROWSER_SERVICE_URL)(
    "creates a live browser session, streams a frame, and returns screenshot artifacts on delete",
    async () => {
      const createResponse = await request(TEST_API_URL)
        .post("/v2/browser")
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .set("Content-Type", "application/json")
        .send({
          ttl: 60,
          activityTtl: 30,
          streamWebView: true,
        });

      expect(createResponse.statusCode).toBe(200);
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.live).toMatchObject({
        status: "streaming",
      });
      expect(createResponse.body.liveViewUrl).toContain("/v2/live/browser/");
      expect(createResponse.body.live.liveViewWsUrl).toContain(
        "/v2/live/browser/",
      );

      const liveViewResponse = await request(TEST_API_URL).get(
        createResponse.body.liveViewUrl,
      );
      expect(liveViewResponse.statusCode).toBe(200);
      expect(liveViewResponse.headers["content-type"]).toContain("text/html");
      expect(liveViewResponse.text).toContain("Request processing");

      const wsUrl = new URL(
        createResponse.body.live.liveViewWsUrl,
        TEST_API_URL,
      );
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
      const frame = await waitForFirstFrame(wsUrl.toString());
      expect(frame).toMatchObject({
        type: "frame",
        mimeType: "image/jpeg",
      });
      expect(typeof frame.data).toBe("string");
      expect(frame.data.length).toBeGreaterThan(0);

      const deleteResponse = await request(TEST_API_URL)
        .delete(`/v2/browser/${encodeURIComponent(createResponse.body.id)}`)
        .set("Authorization", `Bearer ${identity.apiKey}`)
        .send();

      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.body.success).toBe(true);
      expect(deleteResponse.body.live).toMatchObject({
        status: "completed",
      });
      expect(deleteResponse.body.sessionDurationMs).toEqual(expect.any(Number));
      expect(deleteResponse.body.live.screenshotUrl).toContain(
        "/v2/live/browser/",
      );

      const screenshotResponse = await request(TEST_API_URL).get(
        deleteResponse.body.live.screenshotUrl,
      );
      expect(screenshotResponse.statusCode).toBe(200);
      expect(screenshotResponse.headers["content-type"]).toContain(
        "image/jpeg",
      );
      expect(screenshotResponse.body.length).toBeGreaterThan(0);

      if (deleteResponse.body.live.recordingUrl) {
        const recordingResponse = await request(TEST_API_URL).get(
          deleteResponse.body.live.recordingUrl,
        );
        expect(recordingResponse.statusCode).toBe(200);
        expect(recordingResponse.headers["content-type"]).toContain(
          "video/webm",
        );
        expect(recordingResponse.body.length).toBeGreaterThan(0);
      }
    },
    scrapeTimeout,
  );

  itIf(HAS_PLAYWRIGHT && ALLOW_TEST_SUITE_WEBSITE)(
    "returns top-level live metadata and artifact URLs for local live scrape runs",
    async () => {
      const response = await scrapeRaw(
        {
          url: `${TEST_SUITE_WEBSITE}?playgroundLive=${crypto.randomUUID()}`,
          origin: "website-replay-test",
          __playgroundLive: true,
          maxAge: 0,
        },
        identity,
      );

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.live).toMatchObject({
        mode: "single",
        status: expect.stringMatching(/^(completed|warning)$/),
      });
      expect(response.body.live.screenshotUrl).toContain("/v2/live/scrape/");
      expect(response.body.data.metadata.contentType).toBeDefined();

      const screenshotResponse = await request(TEST_API_URL).get(
        response.body.live.screenshotUrl,
      );
      expect(screenshotResponse.statusCode).toBe(200);
      expect(screenshotResponse.headers["content-type"]).toContain(
        "image/jpeg",
      );
      expect(screenshotResponse.body.length).toBeGreaterThan(0);
    },
    scrapeTimeout,
  );

  itIf(canRunReplayHappyPath)(
    "keeps a non-blank replay tab in the foreground for follow-up execs",
    async () => {
      const url = `${TEST_SUITE_WEBSITE}?testId=${crypto.randomUUID()}`;
      let scrapeId: string | null = null;

      try {
        const scrapeResponse = await scrapeRaw(
          {
            url,
            origin: "website-replay-test",
            actions: [
              {
                type: "executeJavascript",
                script: "window.open('about:blank', '_blank');",
              },
            ],
          },
          identity,
        );

        expect(scrapeResponse.statusCode).toBe(200);
        expect(scrapeResponse.body.success).toBe(true);
        expect(typeof scrapeResponse.body.scrape_id).toBe("string");
        scrapeId = scrapeResponse.body.scrape_id as string;

        const executeResponse = await interactWithReplicaRetry(
          scrapeId,
          {
            language: "node",
            timeout: 60,
            code: `
              const visibleUrls = [];
              for (const candidate of page.context().pages()) {
                try {
                  const isVisible = await candidate.evaluate(
                    () => document.visibilityState === "visible",
                  );
                  if (isVisible) {
                    visibleUrls.push(candidate.url());
                  }
                } catch {}
              }

              const visibleNonBlankUrl =
                visibleUrls.find(value => value !== "about:blank") ?? "about:blank";
              console.log(visibleNonBlankUrl);
            `,
          },
          identity,
        );

        expect(executeResponse.statusCode).toBe(200);
        expect(executeResponse.body.success).toBe(true);

        const visibleUrl =
          executeResponse.body.stdout
            ?.trim()
            .split("\n")
            .filter(Boolean)
            .pop() ?? "";

        expect(visibleUrl).not.toBe("about:blank");
        expect(visibleUrl).toContain(TEST_SUITE_WEBSITE);
      } finally {
        if (scrapeId) {
          await scrapeStopInteractiveBrowserRaw(scrapeId, identity);
        }
      }
    },
    scrapeTimeout,
  );

  itIf(!TEST_SELF_HOST)(
    "returns 400 for invalid scrape job id format",
    async () => {
      const response = await scrapeInteractRaw(
        "not-a-valid-uuid",
        {
          code: "console.log('hi')",
          language: "node",
        },
        identity,
      );

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe(
        "Invalid job ID format. Job ID must be a valid UUID.",
      );
    },
  );

  itIf(!TEST_SELF_HOST)(
    "returns 404 when scrape job does not exist",
    async () => {
      const response = await scrapeInteractRaw(
        crypto.randomUUID(),
        {
          code: "console.log('hi')",
          language: "node",
        },
        identity,
      );

      expect(response.statusCode).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe("Job not found.");
    },
  );

  itIf(ALLOW_TEST_SUITE_WEBSITE && !!config.IDMUX_URL)(
    "returns 403 when scrape job belongs to another team",
    async () => {
      const scrapeResponse = await scrapeRaw(
        {
          url: `${TEST_SUITE_WEBSITE}?testId=${crypto.randomUUID()}`,
          origin: "website-replay-test",
        },
        identity,
      );

      expect(scrapeResponse.statusCode).toBe(200);
      expect(scrapeResponse.body.success).toBe(true);
      expect(typeof scrapeResponse.body.scrape_id).toBe("string");

      const scrapeId = scrapeResponse.body.scrape_id as string;
      const executeResponse = await interactWithReplicaRetry(
        scrapeId,
        {
          code: "console.log('should fail')",
          language: "node",
        },
        otherIdentity,
      );

      expect(executeResponse.statusCode).toBe(403);
      expect(executeResponse.body.success).toBe(false);
      expect(executeResponse.body.error).toBe("Forbidden.");
    },
    scrapeTimeout,
  );

  itIf(ALLOW_TEST_SUITE_WEBSITE && !TEST_SELF_HOST)(
    "returns replay-context error when scrape data is not retained",
    async () => {
      const scrapeResponse = await scrapeRaw(
        {
          url: `${TEST_SUITE_WEBSITE}?testId=${crypto.randomUUID()}`,
          origin: "website-replay-test",
          zeroDataRetention: true,
        },
        identity,
      );

      expect(scrapeResponse.statusCode).toBe(200);
      expect(scrapeResponse.body.success).toBe(true);
      expect(typeof scrapeResponse.body.scrape_id).toBe("string");

      const scrapeId = scrapeResponse.body.scrape_id as string;
      const executeResponse = await interactWithReplicaRetry(
        scrapeId,
        {
          code: "console.log('should not run')",
          language: "node",
        },
        identity,
      );

      expect(executeResponse.statusCode).toBe(409);
      expect(executeResponse.body.success).toBe(false);
      expect(executeResponse.body.error).toContain(
        "Replay context is unavailable",
      );
    },
    scrapeTimeout,
  );
});
