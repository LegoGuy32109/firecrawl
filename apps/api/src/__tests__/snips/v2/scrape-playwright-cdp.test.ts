import {
  ALLOW_TEST_SUITE_WEBSITE,
  HAS_FIRE_ENGINE,
  HAS_PLAYWRIGHT,
  TEST_SELF_HOST,
  TEST_SUITE_WEBSITE,
  concurrentIf,
  itIf,
} from "../lib";
import { LocalError, ScrapeError } from "../../../lib/error-codes";
import { errorCodeToHttpStatus } from "../../../lib/error-catalog";
import { Identity, idmux, scrapeTimeout, scrape, scrapeRaw } from "./lib";

const HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE =
  TEST_SELF_HOST && HAS_PLAYWRIGHT && !HAS_FIRE_ENGINE;
const HAS_LOCAL_FIRE_ENGINE_AND_PLAYWRIGHT =
  TEST_SELF_HOST && HAS_FIRE_ENGINE && HAS_PLAYWRIGHT;
const fixtureUrl = `${TEST_SUITE_WEBSITE}/cdp-engine`;
const selectedEngine = (response: { metadata: Record<string, unknown> }) =>
  response.metadata.engine;
const expectRawJpegBase64 = (value: string) => {
  expect(value).toMatch(/^\/9j\//);
  expect(value).not.toMatch(/^https?:\/\//);
  expect(value).not.toMatch(/^data:image\//);
};

const jpegDimensions = (base64: string) => {
  const bytes = Buffer.from(base64, "base64");
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  throw new Error("Could not read JPEG dimensions");
};

describe("playwright;cdp engine", () => {
  let identity: Identity;

  beforeAll(async () => {
    identity = await idmux({
      name: "scrape-playwright-cdp",
      concurrency: 10,
      credits: 100000,
    });
  }, 10000);

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "returns a screenshot when formats includes screenshot",
    async () => {
      const response = await scrape(
        {
          url: TEST_SUITE_WEBSITE,
          formats: ["screenshot"],
          maxAge: 0,
        },
        identity,
      );

      expect(response.screenshot).toBeDefined();
      expect(typeof response.screenshot).toBe("string");
      expect(response.screenshot!.length).toBeGreaterThan(0);
      expectRawJpegBase64(response.screenshot!);
      expect(selectedEngine(response)).toBe("playwright;cdp");
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "returns a full-page screenshot when fullPage is true",
    async () => {
      const response = await scrape(
        {
          url: TEST_SUITE_WEBSITE,
          formats: [{ type: "screenshot", fullPage: true }],
          maxAge: 0,
        },
        identity,
      );

      expect(response.screenshot).toBeDefined();
      expect(typeof response.screenshot).toBe("string");
      expect(response.screenshot!.length).toBeGreaterThan(0);
      expectRawJpegBase64(response.screenshot!);
      expect(selectedEngine(response)).toBe("playwright;cdp");
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "applies screenshot viewport options without changing raw base64 contract",
    async () => {
      const response = await scrape(
        {
          url: TEST_SUITE_WEBSITE,
          formats: [
            {
              type: "screenshot",
              quality: 70,
              viewport: { width: 800, height: 600 },
            },
          ],
          maxAge: 0,
        },
        identity,
      );

      expect(response.screenshot).toBeDefined();
      expectRawJpegBase64(response.screenshot!);
      expect(jpegDimensions(response.screenshot!)).toEqual({
        width: 800,
        height: 600,
      });
      expect(selectedEngine(response)).toBe("playwright;cdp");
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "returns markdown alongside screenshot when both requested",
    async () => {
      const response = await scrape(
        {
          url: TEST_SUITE_WEBSITE,
          formats: ["markdown", "screenshot"],
          maxAge: 0,
        },
        identity,
      );

      expect(response.markdown).toBeDefined();
      expect(response.markdown!.length).toBeGreaterThan(0);
      expect(response.screenshot).toBeDefined();
      expect(typeof response.screenshot).toBe("string");
      expect(selectedEngine(response)).toBe("playwright;cdp");
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "plain scrape without screenshot still succeeds",
    async () => {
      const response = await scrape(
        {
          url: TEST_SUITE_WEBSITE,
          formats: ["markdown"],
          maxAge: 0,
        },
        identity,
      );

      expect(response.markdown).toBeDefined();
      expect(response.screenshot).toBeUndefined();
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "runs click and selector wait actions before markdown and screenshot capture",
    async () => {
      const response = await scrape(
        {
          url: fixtureUrl,
          formats: ["markdown", "screenshot"],
          actions: [
            { type: "click", selector: "#reveal-action" },
            { type: "wait", selector: '#action-state[data-ready="true"]' },
          ],
          maxAge: 0,
        },
        identity,
      );

      expect(response.screenshot).toBeDefined();
      expect(typeof response.screenshot).toBe("string");
      expect(response.screenshot!.length).toBeGreaterThan(0);
      expect(response.markdown).toContain("post-click playwright cdp state");
      expect(selectedEngine(response)).toBe("playwright;cdp");
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "runs a longer successful action chain before scrape output is captured",
    async () => {
      const response = await scrape(
        {
          url: fixtureUrl,
          formats: ["markdown"],
          actions: [
            { type: "wait", selector: "#action-state" },
            { type: "click", selector: "#reveal-action" },
            { type: "wait", selector: '#action-state[data-ready="true"]' },
          ],
          maxAge: 0,
        },
        identity,
      );

      expect(response.markdown).toContain("post-click playwright cdp state");
      expect(selectedEngine(response)).toBe("playwright;cdp");
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "runs executeJavascript actions and returns structured values",
    async () => {
      const response = await scrape(
        {
          url: fixtureUrl,
          formats: ["markdown"],
          actions: [
            {
              type: "executeJavascript",
              script:
                "(() => { document.querySelector('#js-state').textContent = 'execute javascript playwright cdp state'; return { ok: true, engine: 'playwright;cdp' }; })()",
            },
            { type: "screenshot" },
            { type: "wait", selector: "#action-state" },
          ],
          maxAge: 0,
        },
        identity,
      );

      expect(response.markdown).toContain(
        "execute javascript playwright cdp state",
      );
      expect(response.actions?.javascriptReturns?.[0]).toEqual({
        type: "object",
        value: { ok: true, engine: "playwright;cdp" },
      });
      expect(response.actions?.screenshots?.[0]).toEqual(expect.any(String));
      expectRawJpegBase64(response.actions!.screenshots![0]);
      expect(selectedEngine(response)).toBe("playwright;cdp");
    },
    scrapeTimeout,
  );

  itIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "includes action statuses for failed actions and skipped tail actions",
    async () => {
      const raw = await scrapeRaw(
        {
          url: fixtureUrl,
          formats: ["markdown"],
          actions: [
            { type: "wait", selector: "#action-state" },
            { type: "click", selector: "#reveal-action" },
            { type: "wait", selector: '#action-state[data-ready="true"]' },
            { type: "click", selector: "#selector-that-will-not-exist" },
            { type: "scroll", direction: "down" },
            { type: "click", selector: "#reveal-action" },
          ],
          maxAge: 0,
        },
        identity,
      );

      expect(raw.statusCode).toBe(errorCodeToHttpStatus(ScrapeError.ACTION));
      expect(raw.body.success).toBe(false);
      expect(raw.body.code).toBe(ScrapeError.ACTION);
      expect(raw.body.details).toEqual(
        expect.objectContaining({
          actionIndex: 3,
          selector: "#selector-that-will-not-exist",
          actionType: "click",
          actionStatuses: [
            expect.objectContaining({
              name: "Action 0 (wait)",
              status: "ok",
            }),
            expect.objectContaining({
              name: "Action 1 (click)",
              status: "ok",
            }),
            expect.objectContaining({
              name: "Action 2 (wait)",
              status: "ok",
            }),
            expect.objectContaining({
              name: "Action 3 (click)",
              status: "failed",
              code: "SCRAPE_ACTION_ERROR",
            }),
            expect.objectContaining({
              name: "Action 4 (scroll)",
              status: "skipped",
            }),
            expect.objectContaining({
              name: "Action 5 (click)",
              status: "skipped",
            }),
          ],
        }),
      );

      const diagnosticsActions = raw.body.diagnostics?.actions as
        | Array<{
            name: string;
            status: string;
            code?: string;
            durationMs?: number;
          }>
        | undefined;

      expect(diagnosticsActions).toHaveLength(6);
      expect(diagnosticsActions).toEqual([
        expect.objectContaining({
          name: "Action 0 (wait)",
          status: "ok",
        }),
        expect.objectContaining({
          name: "Action 1 (click)",
          status: "ok",
        }),
        expect.objectContaining({
          name: "Action 2 (wait)",
          status: "ok",
        }),
        expect.objectContaining({
          name: "Action 3 (click)",
          status: "failed",
          code: "SCRAPE_ACTION_ERROR",
        }),
        expect.objectContaining({
          name: "Action 4 (scroll)",
          status: "skipped",
        }),
        expect.objectContaining({
          name: "Action 5 (click)",
          status: "skipped",
        }),
      ]);
      expect(diagnosticsActions?.[3].durationMs).toEqual(expect.any(Number));
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "supports mobile viewport and mobile user agent emulation",
    async () => {
      const response = await scrape(
        {
          url: fixtureUrl,
          formats: ["markdown"],
          mobile: true,
          maxAge: 0,
        },
        identity,
      );

      expect(response.markdown).toContain("mobile viewport or user agent");
      expect(selectedEngine(response)).toBe("playwright;cdp");
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "supports geolocation overrides and exposes the injected region",
    async () => {
      const response = await scrape(
        {
          url: fixtureUrl,
          formats: ["markdown"],
          location: { country: "DE", languages: ["de-DE", "en-US"] },
          maxAge: 0,
        },
        identity,
      );

      expect(response.markdown).toContain("geo 52.52 13.40 region DE");
      expect(selectedEngine(response)).toBe("playwright;cdp");
    },
    scrapeTimeout,
  );

  itIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "returns ScrapeError.ACTION with selector details for a bad action selector",
    async () => {
      const raw = await scrapeRaw(
        {
          url: fixtureUrl,
          formats: ["markdown"],
          actions: [
            { type: "click", selector: "#selector-that-will-not-exist" },
          ],
          maxAge: 0,
        },
        identity,
      );

      expect(raw.statusCode).toBe(errorCodeToHttpStatus(ScrapeError.ACTION));
      expect(raw.body.success).toBe(false);
      expect(raw.body.code).toBe(ScrapeError.ACTION);
      expect(raw.body.details).toEqual(
        expect.objectContaining({
          actionIndex: 0,
          selector: "#selector-that-will-not-exist",
        }),
      );
    },
    scrapeTimeout,
  );

  itIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "returns ScrapeError.ACTION for bad executeJavascript code",
    async () => {
      const raw = await scrapeRaw(
        {
          url: fixtureUrl,
          formats: ["markdown"],
          actions: [
            {
              type: "executeJavascript",
              script: "(() => { throw new Error('boom'); })()",
            },
          ],
          maxAge: 0,
        },
        identity,
      );

      expect(raw.statusCode).toBe(errorCodeToHttpStatus(ScrapeError.ACTION));
      expect(raw.body.success).toBe(false);
      expect(raw.body.code).toBe(ScrapeError.ACTION);
      expect(raw.body.details).toEqual(
        expect.objectContaining({
          actionIndex: 0,
        }),
      );
      expect(raw.body.error).toContain("boom");
    },
    scrapeTimeout,
  );

  itIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "returns ScrapeError.ACTION when executeJavascript times out",
    async () => {
      const raw = await scrapeRaw(
        {
          url: fixtureUrl,
          formats: ["markdown"],
          timeout: 2000,
          actions: [
            {
              type: "executeJavascript",
              script: "new Promise(() => {})",
            },
          ],
          maxAge: 0,
        },
        identity,
      );

      expect(raw.statusCode).toBe(errorCodeToHttpStatus(ScrapeError.ACTION));
      expect(raw.body.success).toBe(false);
      expect(raw.body.code).toBe(ScrapeError.ACTION);
      expect(raw.body.details).toEqual(
        expect.objectContaining({
          actionIndex: 0,
        }),
      );
      expect(raw.body.error).toContain("timed out");
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "still rejects branding locally instead of routing it to playwright;cdp",
    async () => {
      const raw = await scrapeRaw(
        {
          url: fixtureUrl,
          formats: ["branding"],
          maxAge: 0,
        },
        identity,
      );

      expect(raw.statusCode).not.toBe(200);
      expect(raw.body.success).toBe(false);
      expect([
        ScrapeError.BRANDING_NOT_SUPPORTED,
        "FEATURE_UNSUPPORTED_LOCALLY",
      ]).toContain(raw.body.code);
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "still rejects stealthProxy locally instead of routing it to playwright;cdp",
    async () => {
      const raw = await scrapeRaw(
        {
          url: fixtureUrl,
          formats: ["markdown"],
          proxy: "stealth",
          maxAge: 0,
        },
        identity,
      );

      expect(raw.statusCode).not.toBe(200);
      expect(raw.body.success).toBe(false);
      expect(raw.body.code).toBe(LocalError.FEATURE_UNSUPPORTED);
      expect(raw.body.details).toEqual(
        expect.objectContaining({
          feature: "stealthProxy",
          requiresEngine: "fire-engine",
        }),
      );
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_LOCAL_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
    "still rejects audio and video locally instead of routing them to playwright;cdp",
    async () => {
      for (const format of ["audio", "video"] as const) {
        const raw = await scrapeRaw(
          {
            url: fixtureUrl,
            formats: [format],
            maxAge: 0,
          },
          identity,
        );

        expect(raw.statusCode).not.toBe(200);
        expect(raw.body.success).toBe(false);
        expect(raw.body.code).toBe(LocalError.FEATURE_UNSUPPORTED);
        expect(raw.body.details).toEqual(
          expect.objectContaining({
            feature: format,
            requiresEngine: "fire-engine",
          }),
        );
      }
    },
    scrapeTimeout,
  );

  concurrentIf(
    HAS_LOCAL_FIRE_ENGINE_AND_PLAYWRIGHT && ALLOW_TEST_SUITE_WEBSITE,
  )(
    "prefers fire-engine over playwright;cdp when both can satisfy screenshot",
    async () => {
      const response = await scrape(
        {
          url: fixtureUrl,
          formats: ["markdown", "screenshot"],
          maxAge: 0,
        },
        identity,
      );

      expect(response.screenshot).toBeDefined();
      expect(selectedEngine(response)).toBe("fire-engine;chrome-cdp");
    },
    scrapeTimeout,
  );
});
