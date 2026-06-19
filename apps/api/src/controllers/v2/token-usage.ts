import { Response } from "express";
import { ErrorResponse, RequestWithAuth } from "./types";
import { getTeamBalance } from "../../services/autumn/usage";
import { makeResponder } from "./response-enveloper";
import { BillingError } from "../../lib/error-codes";

const TOKENS_PER_CREDIT = 15;

interface TokenUsageResponse {
  success: true;
  data: {
    remainingTokens: number;
    planTokens: number;
    billingPeriodStart: string | null;
    billingPeriodEnd: string | null;
  };
}

export async function tokenUsageController(
  req: RequestWithAuth,
  res: Response<TokenUsageResponse | ErrorResponse>,
): Promise<void> {
  const r = makeResponder(req, res);

  const balance = await getTeamBalance(req.auth.team_id);

  if (!balance) {
    r.fail(BillingError.UNAVAILABLE, "Could not find token usage information", {
      details: { dependency: "autumn" },
    });
    return;
  }

  r.ok({
    data: {
      remainingTokens: balance.remaining * TOKENS_PER_CREDIT,
      planTokens: balance.planCredits * TOKENS_PER_CREDIT,
      billingPeriodStart: balance.periodStart,
      billingPeriodEnd: balance.periodEnd,
    },
  });
}
