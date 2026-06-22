describe("browser artifact engine routing", () => {
  const originalFireEngineUrl = process.env.FIRE_ENGINE_BETA_URL;
  const originalPlaywrightUrl = process.env.PLAYWRIGHT_MICROSERVICE_URL;
  const originalPlaywrightCdpUrl = process.env.PLAYWRIGHT_CDP_URL;

  beforeEach(() => {
    process.env.FIRE_ENGINE_BETA_URL = "";
    process.env.PLAYWRIGHT_MICROSERVICE_URL = "http://playwright-service";
    process.env.PLAYWRIGHT_CDP_URL = "http://playwright-service/scrape-cdp";
    vi.resetModules();
  });

  afterEach(() => {
    if (originalFireEngineUrl === undefined) {
      delete process.env.FIRE_ENGINE_BETA_URL;
    } else {
      process.env.FIRE_ENGINE_BETA_URL = originalFireEngineUrl;
    }

    if (originalPlaywrightUrl === undefined) {
      delete process.env.PLAYWRIGHT_MICROSERVICE_URL;
    } else {
      process.env.PLAYWRIGHT_MICROSERVICE_URL = originalPlaywrightUrl;
    }

    if (originalPlaywrightCdpUrl === undefined) {
      delete process.env.PLAYWRIGHT_CDP_URL;
    } else {
      process.env.PLAYWRIGHT_CDP_URL = originalPlaywrightCdpUrl;
    }
  });

  const buildStubMeta = (featureFlags: string[]) =>
    ({
      id: "test",
      url: "https://example.com",
      options: {
        formats: [{ type: "screenshot" }],
        maxAge: 0,
        skipTlsVerification: true,
      },
      internalOptions: { teamId: "test" },
      featureFlags: new Set(featureFlags),
      mock: null,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
      },
    }) as any;

  it("does not fall back to old playwright when screenshot is required", async () => {
    const { buildFallbackList } = await import(
      "../../../scraper/scrapeURL/engines/index.js"
    );

    const fallback = await buildFallbackList(
      buildStubMeta(["screenshot", "skipTlsVerification"]),
    );

    expect(fallback.map(f => f.engine)).toEqual(["playwright;cdp"]);
  });
});
