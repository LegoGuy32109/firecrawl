import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError, MonitorError } from "../../../lib/error-codes";

vi.mock("../feedback/record", () => ({
  recordEndpointFeedback: vi.fn(),
}));

vi.mock("../feedback/record-options", () => ({
  endpointFeedbackRecordOptions: vi.fn(),
  searchFeedbackRecordOptions: vi.fn(),
}));

vi.mock("../../../services/monitoring/store", () => ({
  getMonitorForUpdate: vi.fn(),
}));

vi.mock("../../../services/monitoring/scheduler", () => ({
  enqueueMonitorCheck: vi.fn(),
}));

vi.mock("../../../lib/zdr-helpers", () => ({
  getScrapeZDR: vi.fn(() => "disabled"),
}));

import { feedbackController } from "../feedback/controller";
import { searchFeedbackController } from "../search-feedback";
import { runMonitorController } from "../monitor";
import { getMonitorForUpdate } from "../../../services/monitoring/store";

function buildRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

describe("feedback and monitor error envelopes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["endpoint", feedbackController],
    ["search", searchFeedbackController],
  ])(
    "returns the strict v2 envelope for %s feedback validation errors",
    async (_name, controller) => {
      const req = {
        body: { rating: "bad" },
        auth: { team_id: "team-1" },
        params: { jobId: "01933161-0000-7000-8000-000000000001" },
      } as any;
      const res = buildRes();

      await controller(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          status: "failed",
          code: RequestError.BAD_REQUEST,
          diagnostics: expect.objectContaining({
            privacy: expect.objectContaining({
              mode: "disabled",
            }),
          }),
        }),
      );
      expect(
        (res.json.mock.calls[0]?.[0] as Record<string, unknown>)
          ?.feedbackErrorCode,
      ).toBeUndefined();
    },
  );

  it("returns monitor conflict details through the envelope", async () => {
    (getMonitorForUpdate as any).mockResolvedValue({
      id: "01933161-0000-7000-8000-000000000001",
      team_id: "team-1",
      current_check_id: "01933161-0000-7000-8000-000000000002",
    });

    const req = {
      auth: { team_id: "team-1" },
      params: { monitorId: "01933161-0000-7000-8000-000000000001" },
      body: {},
      query: {},
      acuc: {},
    } as any;
    const res = buildRes();

    await runMonitorController(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: "failed",
        code: MonitorError.CONFLICT,
        details: {
          reason:
            "Check 01933161-0000-7000-8000-000000000002 is already running.",
        },
      }),
    );
  });
});
