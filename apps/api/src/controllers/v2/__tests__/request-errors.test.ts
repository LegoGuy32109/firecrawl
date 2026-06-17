import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthError, BillingError } from "../../../lib/error-codes";

vi.mock("../../../config", () => ({
  config: {
    KEYLESS_PROXY_SECRET: "shared-secret",
  },
}));

vi.mock("../../../lib/keyless", () => ({
  checkKeylessEligibility: vi.fn(),
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
import { creditUsageController } from "../credit-usage";
import { keylessEligibilityController } from "../keyless-eligibility";
import { tokenUsageController } from "../token-usage";
import { getTeamBalance } from "../../../services/autumn/usage";

const getTeamBalanceMock = vi.mocked(getTeamBalance);

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
        code: AuthError.MISSING_API_KEY,
        eligible: false,
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
            service: "autumn",
          }),
        }),
      );
    },
  );
});
