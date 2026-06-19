/**
 * Error envelope verification tests.
 *
 * Verifies that SCRAPE_ACTION_ERROR and BROWSER_EXECUTION_FAILED responses
 * include pageUrl, screenshot, and structured failure metadata (actionIndex,
 * selector, replayFailedAt, stderrSnippet) on the wire.
 *
 * These tests require a self-hosted stack with the Playwright service and,
 * for the replay-fault tests, the replay-fault container
 * (REPLAY_FAULT_URL=http://replay-fault:4322).
 */

import crypto from "crypto";
import { HAS_PLAYWRIGHT, TEST_SELF_HOST, itIf } from "../lib";
import {
  Identity,
  idmux,
  scrapeInteractRaw,
  scrapeRaw,
  scrapeStopInteractiveBrowserRaw,
  scrapeTimeout,
} from "./lib";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const replayFaultUrl = process.env.REPLAY_FAULT_URL ?? "";

const canRun = TEST_SELF_HOST && HAS_PLAYWRIGHT;
const canRunReplayFault = canRun && !!replayFaultUrl;

let identity: Identity;

beforeAll(async () => {
  if (!canRun) return;
  identity = await idmux({
    name: "scrape-error-envelope",
    concurrency: 10,
    credits: 1_000_000,
  });
}, 10000 + scrapeTimeout);

// ── Section A: engine sanity ───────────────────────────────────────────────

describe("S — engine sanity", () => {
  itIf(canRun)(
    "S1: plain scrape returns markdown and metadata",
    async () => {
      const res = await scrapeRaw({ url: "https://example.com" }, identity);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data?.markdown).toBe("string");
      expect(res.body.data.markdown.length).toBeGreaterThan(0);
      expect(res.body.data.metadata).toBeTruthy();
    },
    scrapeTimeout,
  );

  itIf(canRun)(
    "S2: screenshot format returns a real base64 image",
    async () => {
      const res = await scrapeRaw(
        {
          url: "https://example.com",
          formats: ["markdown", { type: "screenshot" } as any],
        },
        identity,
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      const screenshot: string = res.body.data?.screenshot ?? "";
      expect(screenshot.length).toBeGreaterThan(1000);
      expect(screenshot).toMatch(/^\/9j\/|^iVBORw/);
    },
    scrapeTimeout,
  );

  itIf(canRun)(
    "S3: action-level screenshot is captured",
    async () => {
      const res = await scrapeRaw(
        {
          url: "https://example.com",
          actions: [
            { type: "wait", milliseconds: 300 },
            { type: "screenshot" },
          ],
        },
        identity,
      );
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      const screenshots: string[] = res.body.data?.actions?.screenshots ?? [];
      expect(screenshots.length).toBeGreaterThanOrEqual(1);
      expect(screenshots[0].length).toBeGreaterThan(1000);
      expect(screenshots[0]).toMatch(/^\/9j\/|^iVBORw/);
    },
    scrapeTimeout,
  );

  itIf(canRun)(
    "S4: interact executes code and returns stdout",
    async () => {
      const scrapeRes = await scrapeRaw(
        { url: "https://example.com", origin: "website" },
        identity,
      );
      expect(scrapeRes.statusCode).toBe(200);
      const scrapeId: string = scrapeRes.body.scrape_id;
      expect(typeof scrapeId).toBe("string");

      try {
        await sleep(1000);
        const interactRes = await scrapeInteractRaw(
          scrapeId,
          {
            code: `const title = await page.title(); console.log("OK:", title);`,
            language: "node",
            timeout: 20,
          },
          identity,
        );
        expect(interactRes.statusCode).toBe(200);
        expect(interactRes.body.success).toBe(true);
        expect(interactRes.body.code).toBeUndefined();
      } finally {
        await scrapeStopInteractiveBrowserRaw(scrapeId, identity);
      }
    },
    scrapeTimeout,
  );
});

// ── Section B: failure envelope ────────────────────────────────────────────

describe("F — failure envelope", () => {
  itIf(canRun)(
    "F1: selector miss in click action returns SCRAPE_ACTION_ERROR with pageUrl and screenshot",
    async () => {
      const res = await scrapeRaw(
        {
          url: "https://example.com",
          actions: [
            { type: "wait", milliseconds: 200 },
            { type: "click", selector: ".this-selector-does-not-exist-xyz" },
          ],
        },
        identity,
      );
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("SCRAPE_ACTION_ERROR");
      expect(res.body.details?.actionIndex).toBe(1);
      expect(res.body.details?.selector).toBe(
        ".this-selector-does-not-exist-xyz",
      );
      expect(typeof res.body.details?.pageUrl).toBe("string");
      expect(res.body.details.pageUrl).toMatch(/^https:\/\/example\.com/);
      const screenshot: string = res.body.details?.screenshot ?? "";
      expect(screenshot.length).toBeGreaterThan(1000);
      expect(screenshot).toMatch(/^\/9j\/|^iVBORw/);
    },
    scrapeTimeout,
  );

  itIf(canRun)(
    "F2: wait-for-selector timeout returns SCRAPE_ACTION_ERROR with pageUrl and screenshot",
    async () => {
      const res = await scrapeRaw(
        {
          url: "https://example.com",
          actions: [{ type: "wait", selector: ".this-will-never-appear-zzz" }],
        },
        identity,
      );
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe("SCRAPE_ACTION_ERROR");
      expect(res.body.details?.actionIndex).toBe(0);
      expect(res.body.details?.selector).toBe(".this-will-never-appear-zzz");
      expect(typeof res.body.details?.pageUrl).toBe("string");
      expect(res.body.details.pageUrl).toMatch(/^https:\/\/example\.com/);
      const screenshot: string = res.body.details?.screenshot ?? "";
      expect(screenshot.length).toBeGreaterThan(1000);
      expect(res.body.error).toMatch(/[Tt]imeout/);
    },
    scrapeTimeout * 2,
  );

  itIf(canRun)(
    "F3: interact JS exception sets BROWSER_EXECUTION_FAILED with screenshot and replayFailedAt: null",
    async () => {
      const scrapeRes = await scrapeRaw(
        { url: "https://example.com", origin: "website" },
        identity,
      );
      expect(scrapeRes.statusCode).toBe(200);
      const scrapeId: string = scrapeRes.body.scrape_id;
      await sleep(1000);

      try {
        const interactRes = await scrapeInteractRaw(
          scrapeId,
          {
            code: "throw new Error('intentional test failure');",
            language: "node",
            timeout: 10,
          },
          identity,
        );
        expect(interactRes.body.success).toBe(false);
        expect(interactRes.body.code).toBe("BROWSER_EXECUTION_FAILED");
        expect(interactRes.body.details?.exitCode).toBe(1);
        expect(typeof interactRes.body.details?.pageUrl).toBe("string");
        expect(interactRes.body.details.pageUrl).toMatch(
          /^https:\/\/example\.com/,
        );
        const screenshot: string = interactRes.body.details?.screenshot ?? "";
        expect(screenshot.length).toBeGreaterThan(1000);
        expect(interactRes.body.details?.stderrSnippet).toContain(
          "intentional test failure",
        );
        // Critical: plain JS error is NOT a replay failure
        expect(interactRes.body.details?.replayFailedAt ?? null).toBeNull();
      } finally {
        await scrapeStopInteractiveBrowserRaw(scrapeId, identity);
      }
    },
    scrapeTimeout,
  );

  itIf(canRun)(
    "F4: interact error matching replay pattern populates replayFailedAt",
    async () => {
      const scrapeRes = await scrapeRaw(
        { url: "https://example.com", origin: "website" },
        identity,
      );
      expect(scrapeRes.statusCode).toBe(200);
      const scrapeId: string = scrapeRes.body.scrape_id;
      await sleep(1000);

      try {
        const interactRes = await scrapeInteractRaw(
          scrapeId,
          {
            code: "throw new Error('Replay action #3 (click): synthetic test of replay parser');",
            language: "node",
            timeout: 10,
          },
          identity,
        );
        expect(interactRes.body.success).toBe(false);
        expect(interactRes.body.code).toBe("BROWSER_EXECUTION_FAILED");
        expect(interactRes.body.details?.stderrSnippet).toContain(
          "Replay action #3 (click)",
        );
        expect(interactRes.body.details?.replayFailedAt).toEqual({
          actionIndex: 3,
          actionType: "click",
        });
      } finally {
        await scrapeStopInteractiveBrowserRaw(scrapeId, identity);
      }
    },
    scrapeTimeout,
  );

  itIf(canRunReplayFault)(
    "F5b: route removed between scrape and interact captures pageUrl and screenshot of 404 page",
    async () => {
      const token = `f5b-${crypto.randomUUID()}`;
      const url = `${replayFaultUrl.replace(/\/$/, "")}/replay-fault/route?token=${token}`;

      const scrapeRes = await scrapeRaw({ url, origin: "website" }, identity);
      expect(scrapeRes.statusCode).toBe(200);
      expect(scrapeRes.body.success).toBe(true);
      expect(scrapeRes.body.data?.metadata?.title).toBe("Replay Fault — Route");
      const scrapeId: string = scrapeRes.body.scrape_id;
      expect(typeof scrapeId).toBe("string");

      await sleep(1000);

      try {
        const interactRes = await scrapeInteractRaw(
          scrapeId,
          {
            code: `await page.goto('${url}'); await page.waitForSelector('#visit-count', {timeout: 5000});`,
            language: "node",
            timeout: 15,
          },
          identity,
        );
        expect(interactRes.body.success).toBe(false);
        expect(interactRes.body.code).toBe("BROWSER_EXECUTION_FAILED");
        expect(typeof interactRes.body.details?.pageUrl).toBe("string");
        expect(interactRes.body.details.pageUrl).toContain(
          "/replay-fault/route",
        );
        const screenshot: string = interactRes.body.details?.screenshot ?? "";
        expect(screenshot.length).toBeGreaterThan(1000);
      } finally {
        await scrapeStopInteractiveBrowserRaw(scrapeId, identity);
      }
    },
    scrapeTimeout,
  );
});
