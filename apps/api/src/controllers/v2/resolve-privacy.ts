import type { Request, RequestHandler } from "express";
import {
  getPrivacyMode,
  getScrapeZDR,
  getSearchZDR,
} from "../../lib/zdr-helpers";
import type { PrivacyMode, RequestPrivacy, RequestWithAuth } from "./types";

// These run after auth, so acuc is populated; the plain express Request type doesn't know that.
const flagsOf = (req: Request) =>
  (req as RequestWithAuth<unknown, unknown, unknown>).acuc?.flags;

// Resolve privacy ONCE per request (after auth, before the controller) and attach to req.privacy.
// The responder reads it and applies `reduced` to every response — the controller never constructs
// privacy itself. See SPEC-RESPONDER-IMPL RA.

function finish(mode: PrivacyMode): RequestPrivacy {
  return {
    zeroDataRetention:
      mode === "forced" || mode === "request" || mode === "allowed",
    mode,
    reduced: mode === "forced" || mode === "request",
  };
}

/** scrape-family: getScrapeZDR + request zeroDataRetention/lockdown. */
export const resolveScrapePrivacy: RequestHandler = (req, _res, next) => {
  const forcedByTeam = getScrapeZDR(flagsOf(req)) === "forced";
  const requestZdr =
    (req.body?.zeroDataRetention ?? false) || (req.body?.lockdown ?? false);
  const zdr = forcedByTeam || requestZdr;
  req.privacy = finish(getPrivacyMode(zdr, requestZdr, forcedByTeam));
  next();
};

/**
 * search-family: getSearchZDR. Both forced-zdr AND forced-anon reduce diagnostics; the billing
 * distinction between them stays in the search code, not here.
 */
export const resolveSearchPrivacy: RequestHandler = (req, _res, next) => {
  const forced = getSearchZDR(flagsOf(req));
  const mode: PrivacyMode =
    forced === "forced-zdr" || forced === "forced-anon"
      ? "forced"
      : forced === "allowed"
        ? "allowed"
        : "disabled";
  req.privacy = finish(mode);
  next();
};

/**
 * content-free: no scrape/search content is processed. Reassures forced-ZDR teams the path is safe
 * without claiming content was handled.
 */
export const resolveContentFreePrivacy: RequestHandler = (req, _res, next) => {
  req.privacy = {
    zeroDataRetention: getScrapeZDR(flagsOf(req)) === "forced",
    mode: "not_applicable",
    reduced: false,
  };
  next();
};
