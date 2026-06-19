import { Response } from "express";
import { ErrorResponse, RequestWithAuth } from "./types";
import { getTeamBalance } from "../../services/autumn/usage";
import { makeResponder } from "./response-enveloper";
import { BillingError } from "../../lib/error-codes";

interface CreditUsageResponse {
  success: true;
  data: {
    remainingCredits: number;
    planCredits: number;
    billingPeriodStart: string | null;
    billingPeriodEnd: string | null;
  };
}

export async function creditUsageController(
  req: RequestWithAuth,
  res: Response<CreditUsageResponse | ErrorResponse>,
): Promise<void> {
  const r = makeResponder(req, res);

  const balance = await getTeamBalance(req.auth.team_id);

  if (!balance) {
    r.fail(
      BillingError.UNAVAILABLE,
      "Could not find credit usage information",
      {
        details: { dependency: "autumn" },
      },
    );
    return;
  }

  r.ok({
    data: {
      remainingCredits: balance.remaining,
      planCredits: balance.planCredits,
      billingPeriodStart: balance.periodStart,
      billingPeriodEnd: balance.periodEnd,
    },
  });
}
