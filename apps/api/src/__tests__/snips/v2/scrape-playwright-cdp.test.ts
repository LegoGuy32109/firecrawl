import {
  ALLOW_TEST_SUITE_WEBSITE,
  HAS_FIRE_ENGINE,
  HAS_PLAYWRIGHT,
  TEST_SUITE_WEBSITE,
  concurrentIf,
} from "../lib";
import { Identity, idmux, scrapeTimeout, scrape } from "./lib";

const HAS_PLAYWRIGHT_NO_FIRE_ENGINE = HAS_PLAYWRIGHT && !HAS_FIRE_ENGINE;

describe("playwright;cdp engine (E1)", () => {
  let identity: Identity;

  beforeAll(async () => {
    identity = await idmux({
      name: "scrape-playwright-cdp",
      concurrency: 10,
      credits: 100000,
    });
  }, 10000);

  concurrentIf(HAS_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
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
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
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
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
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
    },
    scrapeTimeout,
  );

  concurrentIf(HAS_PLAYWRIGHT_NO_FIRE_ENGINE && ALLOW_TEST_SUITE_WEBSITE)(
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
});
