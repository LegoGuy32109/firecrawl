import {
  ActionsNotSupportedError,
  CrawlDenialError,
  ErrorCodes,
  MapFailedError,
  MapTimeoutError,
  RacedRedirectError,
  ScrapeJobTimeoutError,
  SitemapError,
  TransportableError,
  UnknownError,
} from "./error";
import {
  ActionError,
  DNSResolutionError,
  UnsupportedFileError,
  PDFAntibotError,
  DocumentAntibotError,
  PDFInsufficientTimeError,
  PDFOCRRequiredError,
  NoEnginesLeftError,
  ZDRViolationError,
  PDFPrefetchFailed,
  DocumentPrefetchFailed,
  SiteError,
  SSLError,
  ProxySelectionError,
  AgentIndexOnlyError,
  NoCachedDataError,
  LockdownMissError,
  ScrapeJobCancelledError,
  ScrapeRetryLimitError,
  BrandingNotSupportedError,
  AudioUnsupportedUrlError,
  VideoUnsupportedUrlError,
  XTwitterConfigurationError,
} from "../scraper/scrapeURL/error";
import {
  AgentError,
  CommonError,
  CrawlError,
  MapError,
  RequestError,
  ScrapeError,
} from "./error-codes";
import { parseErrorCode } from "./error-catalog";

// TODO: figure out correct typing for this
const errorMap: Partial<Record<ErrorCodes, any>> = {
  [ScrapeError.TIMEOUT]: ScrapeJobTimeoutError,
  [MapError.TIMEOUT]: MapTimeoutError,
  [CommonError.UNKNOWN]: UnknownError,
  [ScrapeError.ALL_ENGINES_FAILED]: NoEnginesLeftError,
  [ScrapeError.SSL]: SSLError,
  [ScrapeError.SITE]: SiteError,
  [ScrapeError.PROXY_SELECTION]: ProxySelectionError,
  [ScrapeError.PDF_PREFETCH_FAILED]: PDFPrefetchFailed,
  [ScrapeError.DOCUMENT_PREFETCH_FAILED]: DocumentPrefetchFailed,
  [ScrapeError.JOB_CANCELLED]: ScrapeJobCancelledError,
  [ScrapeError.RETRY_LIMIT]: ScrapeRetryLimitError,
  [ScrapeError.ZDR_VIOLATION]: ZDRViolationError,
  [ScrapeError.DNS]: DNSResolutionError,
  [ScrapeError.PDF_INSUFFICIENT_TIME]: PDFInsufficientTimeError,
  [ScrapeError.PDF_ANTIBOT]: PDFAntibotError,
  [ScrapeError.PDF_OCR_REQUIRED]: PDFOCRRequiredError,
  [ScrapeError.DOCUMENT_ANTIBOT]: DocumentAntibotError,
  [ScrapeError.UNSUPPORTED_FILE]: UnsupportedFileError,
  [ScrapeError.NO_CACHED_DATA]: NoCachedDataError,
  [ScrapeError.LOCKDOWN_CACHE_MISS]: LockdownMissError,
  [ScrapeError.ACTION]: ActionError,
  [ScrapeError.ACTIONS_NOT_SUPPORTED]: ActionsNotSupportedError,
  [ScrapeError.BRANDING_NOT_SUPPORTED]: BrandingNotSupportedError,
  [AgentError.INDEX_ONLY]: AgentIndexOnlyError,
  [ScrapeError.RACED_REDIRECT]: RacedRedirectError,
  [ScrapeError.SITEMAP]: SitemapError,
  [CrawlError.DENIAL]: CrawlDenialError,
  [ScrapeError.AUDIO_UNSUPPORTED_URL]: AudioUnsupportedUrlError,
  [ScrapeError.VIDEO_UNSUPPORTED_URL]: VideoUnsupportedUrlError,
  [ScrapeError.X_TWITTER_CONFIGURATION]: XTwitterConfigurationError,
  [MapError.FAILED]: MapFailedError,

  // Zod errors
  [RequestError.BAD_REQUEST]: null,
  [RequestError.BAD_REQUEST_INVALID_JSON]: null,
  [RequestError.PARSE_UNSUPPORTED_OPTIONS]: null,
};

export function serializeTransportableError(error: TransportableError) {
  return `${error.code}|${JSON.stringify(error.serialize())}`;
}

export function deserializeTransportableError(
  data: string,
): InstanceType<(typeof errorMap)[keyof typeof errorMap]> | null {
  const [code, ...serialized] = data.split("|");
  const parsed = parseErrorCode(code);
  if (!parsed) {
    return null;
  }
  const x = errorMap[parsed];
  if (!x) {
    return null;
  }
  return x.deserialize(parsed, JSON.parse(serialized.join("|")));
}
