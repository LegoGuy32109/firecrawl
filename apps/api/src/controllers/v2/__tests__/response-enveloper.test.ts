import { describe, expect, it } from "vitest";
import {
  RateError,
  ScrapeError,
  ScrapeWarning,
} from "../../../lib/error-codes";
import {
  asyncJobFailureResponse,
  errorResponse,
  okResponse,
  warningResponse,
} from "../response-enveloper";

describe("v2 response enveloper", () => {
  it("always includes diagnostics privacy", () => {
    const response = okResponse({ data: { ok: true } }, { traceId: "trace-1" });

    expect(response.httpStatus).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.diagnostics.privacy).toEqual({
      zeroDataRetention: false,
      mode: "disabled",
      reduced: false,
    });
  });

  it("uses warning status when structured warnings are present", () => {
    const response = warningResponse(
      { data: { ok: true }, warning: "partial" },
      [
        {
          code: ScrapeWarning.ENGINE_PARTIAL_FEATURES,
          message: "partial",
          details: { unsupportedFeatures: ["actions"] },
        },
      ],
      { traceId: "trace-2" },
    );

    expect(response.body.status).toBe("warning");
    expect(response.body.warning).toBe("partial");
    expect(response.body.warnings?.[0]?.code).toBe(
      ScrapeWarning.ENGINE_PARTIAL_FEATURES,
    );
  });

  it("maps request errors to catalog HTTP status", () => {
    const response = errorResponse(
      RateError.RATE_LIMIT_EXCEEDED,
      "Too many requests",
      { traceId: "trace-3" },
    );

    expect(response.httpStatus).toBe(429);
    expect(response.body).toMatchObject({
      success: false,
      status: "failed",
      code: RateError.RATE_LIMIT_EXCEEDED,
      error: "Too many requests",
    });
  });

  it("keeps async job failures as HTTP 200 with jobState", () => {
    const response = asyncJobFailureResponse(
      ScrapeError.ALL_ENGINES_FAILED,
      "All engines failed",
      { traceId: "trace-4" },
      {
        failureCount: 2,
        failuresByCode: { [ScrapeError.ALL_ENGINES_FAILED]: 2 },
      },
    );

    expect(response.httpStatus).toBe(200);
    expect(response.body).toMatchObject({
      success: false,
      status: "failed",
      jobState: "failed",
      code: ScrapeError.ALL_ENGINES_FAILED,
      failureCount: 2,
      failuresByCode: { [ScrapeError.ALL_ENGINES_FAILED]: 2 },
    });
  });
});
