import { describe, expect, it } from "vitest";
import {
  ERROR_CATALOG,
  WARNING_CATALOG,
  errorCodeToHttpStatus,
} from "../error-catalog";
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
} from "../error-codes";

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
];

describe("error and warning catalogs", () => {
  it("has a catalog entry for every error code", () => {
    const codes = errorEnums.flatMap(x => Object.values(x));

    expect(Object.keys(ERROR_CATALOG).sort()).toEqual([...codes].sort());
    for (const code of codes) {
      expect(ERROR_CATALOG[code].explanation).toEqual(expect.any(String));
      expect(ERROR_CATALOG[code].fix).toEqual(expect.any(String));
      expect(ERROR_CATALOG[code].httpStatus).toBeGreaterThanOrEqual(200);
      expect(ERROR_CATALOG[code].httpStatus).toBeLessThan(600);
    }
  });

  it("has a catalog entry for every warning code", () => {
    const codes = warningEnums.flatMap(x => Object.values(x));

    expect(Object.keys(WARNING_CATALOG).sort()).toEqual([...codes].sort());
    for (const code of codes) {
      expect(WARNING_CATALOG[code].explanation).toEqual(expect.any(String));
      expect(WARNING_CATALOG[code].fix).toEqual(expect.any(String));
    }
  });

  it("keeps status mappings sane and rejects unknown typed keys", () => {
    expect(errorCodeToHttpStatus(ScrapeError.TIMEOUT)).toBe(408);
    expect(errorCodeToHttpStatus(RateError.RATE_LIMIT_EXCEEDED)).toBe(429);
    expect(errorCodeToHttpStatus(CommonError.UNKNOWN)).toBe(500);

    // @ts-expect-error Unknown string keys are not part of the typed catalog.
    expect(ERROR_CATALOG.NOT_A_REAL_CODE).toBeUndefined();
  });
});
