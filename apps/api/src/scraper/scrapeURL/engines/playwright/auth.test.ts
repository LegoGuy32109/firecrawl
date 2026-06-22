describe("getPlaywrightServiceHeaders", () => {
  const originalBrowserServiceApiKey = process.env.BROWSER_SERVICE_API_KEY;

  afterEach(() => {
    if (originalBrowserServiceApiKey === undefined) {
      delete process.env.BROWSER_SERVICE_API_KEY;
    } else {
      process.env.BROWSER_SERVICE_API_KEY = originalBrowserServiceApiKey;
    }
    vi.resetModules();
  });

  it("includes browser service auth when configured", async () => {
    process.env.BROWSER_SERVICE_API_KEY = "local-browser-service-secret";
    vi.resetModules();

    const { getPlaywrightServiceHeaders } = await import("./auth.js");

    expect(getPlaywrightServiceHeaders()).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer local-browser-service-secret",
    });
  });

  it("omits auth when no browser service key is configured", async () => {
    delete process.env.BROWSER_SERVICE_API_KEY;
    vi.resetModules();

    const { getPlaywrightServiceHeaders } = await import("./auth.js");

    expect(getPlaywrightServiceHeaders()).toEqual({
      "Content-Type": "application/json",
    });
  });
});
