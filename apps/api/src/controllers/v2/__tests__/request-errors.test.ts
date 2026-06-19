import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  AuthError,
  BillingError,
  RequestError,
} from "../../../lib/error-codes";

vi.mock("../../../config", () => ({
  config: {
    KEYLESS_PROXY_SECRET: "shared-secret",
  },
}));

vi.mock("../../../lib/keyless", () => ({
  checkKeylessEligibility: vi.fn(),
}));

vi.mock("../../../lib/permissions", () => ({
  checkPermissions: vi.fn(),
}));

vi.mock("../../../services/autumn/usage", () => ({
  getTeamBalance: vi.fn(),
}));

vi.mock("../../../services/worker/nuq-router", () => ({
  getCombinedTeamActiveCount: vi.fn(),
}));

vi.mock("../../auth", () => ({
  getACUCTeam: vi.fn(),
}));

import { concurrencyCheckController } from "../concurrency-check";
import { crawlParamsPreviewController } from "../crawl-params-preview";
import { creditUsageController } from "../credit-usage";
import { keylessEligibilityController } from "../keyless-eligibility";
import { parseController } from "../parse";
import { scrapeController } from "../scrape";
import { tokenUsageController } from "../token-usage";
import { getTeamBalance } from "../../../services/autumn/usage";
import { checkPermissions } from "../../../lib/permissions";

const getTeamBalanceMock = vi.mocked(getTeamBalance);
const checkPermissionsMock = vi.mocked(checkPermissions);

function buildRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

describe("v2 request-level error envelopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("wraps keyless eligibility auth failures in the v2 envelope", async () => {
    const req = {
      headers: {},
      ip: "203.0.113.10",
    } as any;
    const res = buildRes();

    await keylessEligibilityController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: "failed",
        code: expect.any(String),
      }),
    );
  });

  it("wraps missing concurrency auth in the v2 envelope", async () => {
    const req = {
      auth: { team_id: "team-1" },
      acuc: undefined,
    } as any;
    const res = buildRes();

    await concurrencyCheckController(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: "failed",
        code: AuthError.MISSING_API_KEY,
      }),
    );
  });

  it("wraps crawl params preview validation failures in the v2 envelope", async () => {
    const req = {
      auth: { team_id: "team-1" },
      body: { url: "not-a-url", prompt: "" },
    } as any;
    const res = buildRes();

    await crawlParamsPreviewController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: "failed",
        code: RequestError.BAD_REQUEST,
        diagnostics: expect.objectContaining({
          privacy: expect.objectContaining({
            zeroDataRetention: false,
          }),
        }),
      }),
    );
  });

  it.each([
    ["token", tokenUsageController],
    ["credit", creditUsageController],
  ])(
    "wraps missing %s usage data in the v2 envelope",
    async (_name, controller) => {
      getTeamBalanceMock.mockResolvedValueOnce(null);

      const req = {
        auth: { team_id: "team-1" },
      } as any;
      const res = buildRes();

      await controller(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: "failed",
          code: BillingError.UNAVAILABLE,
          details: expect.objectContaining({
            dependency: "autumn",
          }),
        }),
      );
    },
  );

  it("wraps scrape permission failures in the v2 envelope", async () => {
    checkPermissionsMock.mockReturnValueOnce({
      error:
        "Zero Data Retention (ZDR) is not enabled for your team. Contact support@firecrawl.com to enable this feature.",
    });

    const req = {
      auth: { team_id: "team-1" },
      acuc: { flags: null },
      body: {
        url: "https://example.com",
      },
    } as any;
    const res = buildRes();

    await scrapeController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: "failed",
        code: RequestError.FORBIDDEN,
        error:
          "Zero Data Retention (ZDR) is not enabled for your team. Contact support@firecrawl.com to enable this feature.",
        diagnostics: expect.objectContaining({
          privacy: expect.objectContaining({
            zeroDataRetention: false,
            mode: "disabled",
          }),
        }),
      }),
    );
  });

  it("wraps parse agent interop failures in the v2 envelope", async () => {
    checkPermissionsMock.mockReturnValueOnce({});

    const req = {
      auth: { team_id: "team-1" },
      acuc: { flags: null, concurrency: 1 },
      body: {
        file: {
          buffer: Buffer.from("<html><body>hello</body></html>"),
          filename: "upload.html",
          contentType: "text/html",
          kind: "html",
        },
        formats: ["markdown"],
        __agentInterop: {
          auth: "definitely-wrong",
          requestId: "request-1",
          shouldBill: false,
        },
      },
    } as any;
    const res = buildRes();

    await parseController(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: "failed",
        code: AuthError.INTEROP_FORBIDDEN,
        error: expect.stringMatching(/agent interop/i),
        diagnostics: expect.objectContaining({
          privacy: expect.objectContaining({
            zeroDataRetention: false,
            mode: "disabled",
          }),
        }),
      }),
    );
  });
});
