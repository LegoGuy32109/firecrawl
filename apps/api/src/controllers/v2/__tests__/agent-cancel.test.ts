import type { Mock } from "vitest";
import { afterEach } from "vitest";
import type { Response } from "express";
import { agentCancelController } from "../agent-cancel";
import type { RequestWithAuth } from "../types";
import {
  supabaseGetAgentByIdDirect,
  supabaseGetAgentRequestByIdDirect,
} from "../../../lib/supabase-jobs";

vi.mock("../../../lib/supabase-jobs", () => ({
  supabaseGetAgentByIdDirect: vi.fn(),
  supabaseGetAgentRequestByIdDirect: vi.fn(),
}));

describe("agentCancelController", () => {
  const baseReq = {
    params: { jobId: "job-123" },
    auth: { team_id: "team-123" },
  } as RequestWithAuth<{ jobId: string }, any, any>;

  const buildRes = () =>
    ({
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    }) as unknown as Response;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats an already-cancelled agent job as a successful terminal state", async () => {
    (supabaseGetAgentRequestByIdDirect as Mock).mockResolvedValue({
      team_id: "team-123",
      created_at: "2025-01-01T00:00:00Z",
    });
    (supabaseGetAgentByIdDirect as Mock).mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 409,
      }),
    );

    const res = buildRes();
    await agentCancelController(baseReq, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: "cancelled",
      }),
    );
  });
});
