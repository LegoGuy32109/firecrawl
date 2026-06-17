import { describe, expect, it, vi } from "vitest";
import {
  RateError,
  ScrapeError,
  ScrapeWarning,
} from "../../../lib/error-codes";
import { DiagnosticStatus, JobState, ResponseStatus } from "../types";
import {
  asyncJobFailureResponse,
  addStep,
  buildDiagnosticsPrivacy,
  errorResponse,
  makeResponder,
  okResponse,
  warningResponse,
  diagnosticsForRequest,
} from "../response-enveloper";

function createResponse() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

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

  it("derives reduced privacy from mode instead of caller input", () => {
    expect(
      buildDiagnosticsPrivacy(undefined, {
        privacyMode: "forced",
        reducedDiagnostics: false,
      }),
    ).toEqual({
      zeroDataRetention: false,
      mode: "forced",
      reduced: true,
    });

    expect(
      buildDiagnosticsPrivacy(undefined, {
        privacyMode: "disabled",
        reducedDiagnostics: true,
      }),
    ).toEqual({
      zeroDataRetention: false,
      mode: "disabled",
      reduced: false,
    });

    expect(
      buildDiagnosticsPrivacy(undefined, {
        privacyMode: "not_applicable",
        reducedDiagnostics: true,
      }),
    ).toEqual({
      zeroDataRetention: false,
      mode: "not_applicable",
      reduced: false,
    });
  });

  it("defaults responder privacy safely before auth", () => {
    const res = createResponse();
    const r = makeResponder({} as any, res);

    r.step({ name: "request", status: DiagnosticStatus.Ok });
    r.processing({ data: { ok: true } });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: ResponseStatus.Processing,
        diagnostics: expect.objectContaining({
          privacy: {
            zeroDataRetention: false,
            mode: "disabled",
            reduced: false,
          },
        }),
      }),
    );
  });

  it("strips unsafe step data when privacy is reduced", () => {
    const diagnostics = diagnosticsForRequest(undefined, {
      privacyMode: "forced",
    });

    const response = addStep(
      diagnostics,
      {
        name: "unsafe-step",
        status: DiagnosticStatus.Warning,
        code: ScrapeError.TIMEOUT,
        message: "raw message with secret https://example.com",
        messageTemplate: "Request to {host} timed out",
        details: { host: "example.com", secret: "token-123" },
      },
      "steps",
    );

    expect(response.steps?.[0]).toEqual({
      name: "response",
      status: "warning",
      code: ScrapeError.TIMEOUT,
      message: "Request to {host} timed out",
    });
  });

  it("preserves safe step details when privacy is not reduced", () => {
    const diagnostics = diagnosticsForRequest(undefined, {
      privacyMode: "disabled",
    });

    const response = addStep(
      diagnostics,
      {
        name: "handler",
        status: DiagnosticStatus.Ok,
        code: ScrapeWarning.ENGINE_PARTIAL_FEATURES,
        message: "partial completion",
        details: { unsupportedFeatures: ["actions"] },
      },
      "steps",
    );

    expect(response.steps?.[0]).toEqual({
      name: "handler",
      status: "ok",
      code: ScrapeWarning.ENGINE_PARTIAL_FEATURES,
      message: "partial completion",
      details: { unsupportedFeatures: ["actions"] },
    });
  });

  it("uses warning status when warning data is present", () => {
    const response = okResponse(
      { data: { ok: true }, warning: "partial" },
      { traceId: "trace-2" },
    );

    expect(response.body.status).toBe("warning");
    expect(response.body.warning).toBe("partial");
    expect(response.body.diagnostics.privacy).toEqual({
      zeroDataRetention: false,
      mode: "disabled",
      reduced: false,
    });
  });

  it("keeps explicit warning responses on warning status", () => {
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
      status: ResponseStatus.Failed,
      code: RateError.RATE_LIMIT_EXCEEDED,
      error: "Too many requests",
    });
    expect(response.body.diagnostics.privacy).toEqual({
      zeroDataRetention: false,
      mode: "disabled",
      reduced: false,
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
      status: ResponseStatus.Failed,
      jobState: JobState.Failed,
      code: ScrapeError.ALL_ENGINES_FAILED,
      failureCount: 2,
      failuresByCode: { [ScrapeError.ALL_ENGINES_FAILED]: 2 },
    });
    expect(response.body.diagnostics.privacy).toEqual({
      zeroDataRetention: false,
      mode: "disabled",
      reduced: false,
    });
  });
});
