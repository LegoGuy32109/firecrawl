import { describe, expect, it } from "vitest";
import {
  ERROR_CATALOG,
  WARNING_CATALOG,
  errorCodeToHttpStatus,
  explainError,
  explainWarning,
  makeWarning,
  parseErrorCode,
  parseWarningCode,
} from "../../error-catalog";
import {
  AgentError,
  AuthError,
  BillingError,
  BrowserError,
  ChangeTrackingWarning,
  CommonError,
  CrawlError,
  CrawlWarning,
  DependencyError,
  ExtractError,
  ExtractWarning,
  FeedbackError,
  GatingError,
  LifecycleError,
  LiveWarning,
  LocalError,
  MapError,
  MapWarning,
  MediaWarning,
  MonitorError,
  ProxyError,
  QueryWarning,
  RateError,
  RequestError,
  ScrapeError,
  ScrapeWarning,
} from "../../error-codes";
import type {
  ErrorDetailsFor,
  ErrorDetailsMap,
  WarningDetailsMap,
} from "../../error-details";

const errorEnums = [
  AuthError,
  BillingError,
  RateError,
  GatingError,
  LifecycleError,
  CrawlError,
  ScrapeError,
  ExtractError,
  AgentError,
  MapError,
  DependencyError,
  BrowserError,
  MonitorError,
  ProxyError,
  FeedbackError,
  LocalError,
  RequestError,
  CommonError,
];

const warningEnums = [
  ScrapeWarning,
  ExtractWarning,
  QueryWarning,
  ChangeTrackingWarning,
  MediaWarning,
  MapWarning,
  CrawlWarning,
  LiveWarning,
];

const typedDnsDetails: ErrorDetailsFor<ScrapeError.DNS> = {
  hostname: "example.com",
};
const typedErrorDetails: ErrorDetailsMap[ScrapeError.DNS] = typedDnsDetails;
const typedWarningDetails: WarningDetailsMap[MediaWarning.AUDIO_UNAVAILABLE] = {
  reason: "not_configured",
};

describe("error catalog", () => {
  it("is complete for every error code", () => {
    const codes = errorEnums.flatMap(x => Object.values(x));

    expect(Object.keys(ERROR_CATALOG).sort()).toEqual([...codes].sort());
    for (const code of codes) {
      const entry = explainError(code as (typeof codes)[number]);

      expect(entry).toEqual(ERROR_CATALOG[code as keyof typeof ERROR_CATALOG]);
      expect(entry.explanation).toEqual(expect.any(String));
      expect(entry.fix).toEqual(expect.any(String));
      expect(entry.httpStatus).toBeGreaterThanOrEqual(200);
      expect(entry.httpStatus).toBeLessThan(600);
      expect(errorCodeToHttpStatus(code as (typeof codes)[number])).toBe(
        entry.httpStatus,
      );
    }
  });

  it("is complete for every warning code", () => {
    const codes = warningEnums.flatMap(x => Object.values(x));

    expect(Object.keys(WARNING_CATALOG).sort()).toEqual([...codes].sort());
    for (const code of codes) {
      const entry = explainWarning(code as (typeof codes)[number]);

      expect(entry).toEqual(
        WARNING_CATALOG[code as keyof typeof WARNING_CATALOG],
      );
      expect(entry.explanation).toEqual(expect.any(String));
      expect(entry.fix).toEqual(expect.any(String));
    }
  });

  it("parses known codes and rejects unknown values", () => {
    expect(parseErrorCode(ScrapeError.TIMEOUT)).toBe(ScrapeError.TIMEOUT);
    expect(parseErrorCode(CommonError.UNKNOWN)).toBe(CommonError.UNKNOWN);
    expect(parseErrorCode("NOT_A_CODE")).toBeUndefined();

    expect(parseWarningCode(MediaWarning.AUDIO_UNAVAILABLE)).toBe(
      MediaWarning.AUDIO_UNAVAILABLE,
    );
    expect(parseWarningCode("NOT_A_WARNING")).toBeUndefined();
  });

  it("builds warning occurrences without drifting from the supplied message", () => {
    expect(typedErrorDetails).toEqual({ hostname: "example.com" });
    expect(typedWarningDetails).toEqual({ reason: "not_configured" });

    const detailed = makeWarning(
      MediaWarning.AUDIO_UNAVAILABLE,
      "Audio extraction is unavailable.",
      { reason: "not_configured" },
    );
    const plain = makeWarning(
      CrawlWarning.FEW_RESULTS,
      "The crawl produced fewer results than expected.",
    );

    expect(detailed).toEqual({
      code: MediaWarning.AUDIO_UNAVAILABLE,
      message: "Audio extraction is unavailable.",
      details: { reason: "not_configured" },
    });
    expect(plain).toEqual({
      code: CrawlWarning.FEW_RESULTS,
      message: "The crawl produced fewer results than expected.",
    });

    if (false) {
      makeWarning(MediaWarning.AUDIO_UNAVAILABLE, "x", {
        // @ts-expect-error Details must match the warning code.
        unsupportedFeatures: ["video"],
      });
    }
  });
});
