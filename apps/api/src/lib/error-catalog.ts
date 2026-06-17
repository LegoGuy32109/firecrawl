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
  ErrorCodes,
  ExtractError,
  ExtractWarning,
  FeedbackError,
  GatingError,
  LifecycleError,
  LocalError,
  LiveWarning,
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
  WarningCodes,
} from "./error-codes";
import { WarningDetailsFor } from "./error-details";

interface ErrorCatalogEntry {
  httpStatus: number;
  explanation: string;
  fix: string;
}

interface WarningCatalogEntry {
  explanation: string;
  fix: string;
}

type WarningOccurrence<C extends WarningCodes> = {
  code: C;
  message: string;
  details?: WarningDetailsFor<C>;
};

const entry = (
  httpStatus: number,
  explanation: string,
  fix: string,
): ErrorCatalogEntry => ({ httpStatus, explanation, fix });

const warn = (explanation: string, fix: string): WarningCatalogEntry => ({
  explanation,
  fix,
});

export const ERROR_CATALOG = {
  [AuthError.MISSING_API_KEY]: entry(
    401,
    "The request did not include an API key.",
    "Send a valid Authorization bearer token.",
  ),
  [AuthError.INVALID_API_KEY]: entry(
    401,
    "The API key is invalid or no longer active.",
    "Create or use a valid Firecrawl API key.",
  ),
  [AuthError.KEY_NOT_KEYLESS_ELIGIBLE]: entry(
    401,
    "The key cannot use keyless access.",
    "Use a standard API key or complete keyless setup.",
  ),
  [AuthError.INTEROP_FORBIDDEN]: entry(
    403,
    "Agent interop is not enabled or the provided agent interop secret is invalid.",
    "Use a valid agent interop secret or disable agent interop.",
  ),
  [AuthError.TEAM_SUSPENDED]: entry(
    403,
    "The team is suspended.",
    "Contact support or resolve the account issue.",
  ),
  [AuthError.BACKEND_UNAVAILABLE]: entry(
    503,
    "Authentication could not be verified because a backend dependency is unavailable.",
    "Retry shortly.",
  ),
  [AuthError.OAUTH_TOKEN_EXPIRED]: entry(
    401,
    "The OAuth token expired.",
    "Refresh the OAuth connection.",
  ),
  [BillingError.INSUFFICIENT_CREDITS]: entry(
    402,
    "The team does not have enough credits.",
    "Add credits or reduce request cost.",
  ),
  [BillingError.UNVERIFIED_CREDIT_LIMIT]: entry(
    402,
    "The account has reached an unverified credit limit.",
    "Verify billing details.",
  ),
  [BillingError.SPONSOR_VERIFICATION_EXPIRED]: entry(
    402,
    "Sponsor verification has expired.",
    "Sign in and refresh sponsor verification.",
  ),
  [BillingError.UNAVAILABLE]: entry(
    503,
    "Billing could not be checked.",
    "Retry shortly.",
  ),
  [RateError.RATE_LIMIT_EXCEEDED]: entry(
    429,
    "The request exceeded the applicable rate limit.",
    "Wait before retrying.",
  ),
  [RateError.QUEUE_FULL]: entry(
    429,
    "The processing queue is full.",
    "Retry after load decreases.",
  ),
  [GatingError.URL_BLOCKED]: entry(
    403,
    "The URL is blocked by policy.",
    "Use an allowed URL or update team policy.",
  ),
  [GatingError.COUNTRY_RESTRICTED]: entry(
    403,
    "The requested country or region is restricted.",
    "Choose an allowed country.",
  ),
  [GatingError.IDEMPOTENCY_CONFLICT]: entry(
    409,
    "The idempotency key conflicts with an existing request.",
    "Use the original result or a new key.",
  ),
  [LifecycleError.JOB_NOT_FOUND]: entry(
    404,
    "The job was not found.",
    "Check the job id.",
  ),
  [LifecycleError.JOB_EXPIRED]: entry(
    404,
    "The job has expired.",
    "Start a new job.",
  ),
  [LifecycleError.JOB_WRONG_TEAM]: entry(
    403,
    "The job belongs to another team.",
    "Use credentials for the owning team.",
  ),
  [LifecycleError.JOB_CANCELLED]: entry(
    409,
    "The job was cancelled.",
    "Start a new job if needed.",
  ),
  [LifecycleError.ZDR_NOT_SUPPORTED]: entry(
    422,
    "The requested feature is not available with ZDR.",
    "Disable ZDR or remove the feature.",
  ),
  [CrawlError.DENIAL]: entry(
    403,
    "The crawl was denied by policy or robots rules.",
    "Adjust crawl scope or permissions.",
  ),
  [ScrapeError.TIMEOUT]: entry(
    408,
    "The scrape timed out.",
    "Increase timeout or simplify the request.",
  ),
  [ScrapeError.ALL_ENGINES_FAILED]: entry(
    502,
    "All scrape engines failed.",
    "Verify the URL is reachable and retry.",
  ),
  [ScrapeError.SSL]: entry(
    422,
    "The site has an SSL/TLS issue.",
    "Fix the site certificate or use skipTlsVerification only for trusted targets.",
  ),
  [ScrapeError.SITE]: entry(
    502,
    "The target site failed to load.",
    "Verify the site is reachable.",
  ),
  [ScrapeError.PROXY_SELECTION]: entry(
    422,
    "The requested proxy configuration could not be selected.",
    "Use a supported proxy location or remove proxy constraints.",
  ),
  [ScrapeError.PDF_PREFETCH_FAILED]: entry(
    502,
    "PDF prefetch failed.",
    "Retry or use another URL.",
  ),
  [ScrapeError.DOCUMENT_PREFETCH_FAILED]: entry(
    502,
    "Document prefetch failed.",
    "Retry or use another URL.",
  ),
  [ScrapeError.JOB_CANCELLED]: entry(
    409,
    "The scrape job was cancelled.",
    "Start a new scrape if needed.",
  ),
  [ScrapeError.RETRY_LIMIT]: entry(
    502,
    "The scrape exceeded its retry limit.",
    "Retry later or simplify requested features.",
  ),
  [ScrapeError.ZDR_VIOLATION]: entry(
    400,
    "A requested feature violates ZDR constraints.",
    "Disable the feature or ZDR.",
  ),
  [ScrapeError.DNS]: entry(
    200,
    "DNS resolution failed for the target host.",
    "Check the domain spelling and DNS state.",
  ),
  [ScrapeError.PDF_INSUFFICIENT_TIME]: entry(
    408,
    "The PDF needs more processing time.",
    "Increase timeout.",
  ),
  [ScrapeError.PDF_ANTIBOT]: entry(
    502,
    "PDF access was blocked by anti-bot protection.",
    "Retry or contact support for critical URLs.",
  ),
  [ScrapeError.PDF_OCR_REQUIRED]: entry(
    422,
    "The PDF requires OCR but OCR was not enabled.",
    "Use auto or OCR PDF mode.",
  ),
  [ScrapeError.DOCUMENT_ANTIBOT]: entry(
    502,
    "Document access was blocked by anti-bot protection.",
    "Retry or contact support for critical URLs.",
  ),
  [ScrapeError.UNSUPPORTED_FILE]: entry(
    422,
    "The URL returned an unsupported file type.",
    "Use HTML, PDF, or supported document formats.",
  ),
  [ScrapeError.ACTION]: entry(
    422,
    "A scrape action failed.",
    "Check action selectors and timing.",
  ),
  [ScrapeError.RACED_REDIRECT]: entry(
    409,
    "The URL was already scraped via a redirect race.",
    "Use the existing crawl result.",
  ),
  [ScrapeError.NO_CACHED_DATA]: entry(
    404,
    "No cache entry matched the request.",
    "Allow a fresh scrape or retry later.",
  ),
  [ScrapeError.LOCKDOWN_CACHE_MISS]: entry(
    404,
    "Lockdown mode has no cached result.",
    "Disable lockdown or scrape after cache is populated.",
  ),
  [ScrapeError.SITEMAP]: entry(
    502,
    "Sitemap processing failed.",
    "Verify sitemap accessibility.",
  ),
  [ScrapeError.ACTIONS_NOT_SUPPORTED]: entry(
    400,
    "Actions are not supported for this request path.",
    "Remove actions or use a supported engine.",
  ),
  [ScrapeError.BRANDING_NOT_SUPPORTED]: entry(
    400,
    "Branding is not supported for this content.",
    "Remove branding format.",
  ),
  [ScrapeError.AUDIO_UNSUPPORTED_URL]: entry(
    422,
    "Audio extraction does not support this URL.",
    "Use a supported audio URL.",
  ),
  [ScrapeError.VIDEO_UNSUPPORTED_URL]: entry(
    422,
    "Video extraction does not support this URL.",
    "Use a supported video URL.",
  ),
  [ScrapeError.X_TWITTER_CONFIGURATION]: entry(
    503,
    "X/Twitter scraping is not configured.",
    "Configure XAI_API_KEY or remove the request.",
  ),
  [ExtractError.NO_VALID_URLS]: entry(
    400,
    "No valid URLs were provided for extraction.",
    "Provide at least one valid URL.",
  ),
  [ExtractError.SCHEMA_MISMATCH]: entry(
    422,
    "The extraction result did not match the schema.",
    "Adjust the schema or prompt.",
  ),
  [ExtractError.LLM_REFUSAL]: entry(
    422,
    "The LLM refused the extraction request.",
    "Revise the prompt or content.",
  ),
  [ExtractError.SCRAPE_FAILED]: entry(
    502,
    "A scrape needed for extraction failed.",
    "Inspect the scrape error and retry.",
  ),
  [AgentError.INDEX_ONLY]: entry(
    403,
    "The account can only access indexed pages.",
    "Confirm the account to unlock full scraping.",
  ),
  [AgentError.UPSTREAM]: entry(
    502,
    "The agent upstream failed.",
    "Retry later.",
  ),
  [MapError.TIMEOUT]: entry(
    408,
    "The map operation timed out.",
    "Use a narrower URL or retry.",
  ),
  [MapError.FAILED]: entry(
    500,
    "The map operation failed.",
    "Retry or use a different starting URL.",
  ),
  [DependencyError.UNAVAILABLE]: entry(
    503,
    "A required dependency is unavailable.",
    "Retry shortly.",
  ),
  [DependencyError.TIMEOUT]: entry(
    504,
    "A required dependency timed out.",
    "Retry shortly.",
  ),
  [BrowserError.SESSION_NOT_FOUND]: entry(
    404,
    "The browser session was not found.",
    "Check the session id.",
  ),
  [BrowserError.SESSION_EXPIRED]: entry(
    410,
    "The browser session expired.",
    "Create a new session.",
  ),
  [BrowserError.SESSION_FORBIDDEN]: entry(
    403,
    "The browser session belongs to another team.",
    "Use the owning team credentials.",
  ),
  [BrowserError.SESSION_LIMIT_EXCEEDED]: entry(
    429,
    "The browser session limit was exceeded.",
    "Close sessions or wait.",
  ),
  [BrowserError.EXECUTION_FAILED]: entry(
    422,
    "Browser execution failed.",
    "Retry or simplify the browser operation.",
  ),
  [BrowserError.SERVICE_UNAVAILABLE]: entry(
    503,
    "The browser service is unavailable.",
    "Retry shortly.",
  ),
  [MonitorError.MONITOR_NOT_FOUND]: entry(
    404,
    "The monitor was not found.",
    "Check the monitor id.",
  ),
  [MonitorError.CHECK_NOT_FOUND]: entry(
    404,
    "The monitor check was not found.",
    "Check the check id.",
  ),
  [MonitorError.EMAIL_TOKEN_INVALID]: entry(
    400,
    "The monitor email token is invalid.",
    "Request a new token.",
  ),
  [MonitorError.EMAIL_TOKEN_EXPIRED]: entry(
    400,
    "The monitor email token expired.",
    "Request a new token.",
  ),
  [MonitorError.CONFLICT]: entry(
    409,
    "The monitor request conflicts with current state.",
    "Refresh state and retry.",
  ),
  [ProxyError.UPSTREAM_UNAVAILABLE]: entry(
    502,
    "The proxy upstream is unavailable.",
    "Retry shortly.",
  ),
  [ProxyError.UPSTREAM_TIMEOUT]: entry(
    504,
    "The proxy upstream timed out.",
    "Retry shortly.",
  ),
  [ProxyError.UPSTREAM_BAD_RESPONSE]: entry(
    502,
    "The proxy upstream returned an invalid response.",
    "Retry shortly.",
  ),
  [ProxyError.NOT_CONFIGURED]: entry(
    503,
    "The proxy is not configured.",
    "Configure the proxy service.",
  ),
  [FeedbackError.TARGET_NOT_FOUND]: entry(
    404,
    "The feedback target was not found.",
    "Check the target id.",
  ),
  [FeedbackError.WINDOW_EXPIRED]: entry(
    410,
    "The feedback window expired.",
    "Submit feedback sooner.",
  ),
  [FeedbackError.TEAM_OPTED_OUT]: entry(
    403,
    "The team has opted out of feedback.",
    "Enable feedback for the team.",
  ),
  [FeedbackError.DB_UNAVAILABLE]: entry(
    503,
    "Feedback storage is unavailable.",
    "Retry shortly.",
  ),
  [FeedbackError.PREVIEW_UNAVAILABLE]: entry(
    403,
    "Feedback is not available for preview teams.",
    "Use a non-preview team to submit feedback.",
  ),
  [FeedbackError.JOB_NOT_SUCCESSFUL]: entry(
    409,
    "Feedback cannot be submitted for a job that did not succeed.",
    "Only submit feedback for jobs that completed successfully.",
  ),
  [LocalError.FEATURE_UNSUPPORTED]: entry(
    422,
    "The feature is unsupported in this local environment.",
    "Enable the required engine or disable the feature.",
  ),
  [RequestError.BAD_REQUEST]: entry(
    400,
    "The request is invalid.",
    "Fix request parameters.",
  ),
  [RequestError.BAD_REQUEST_INVALID_JSON]: entry(
    400,
    "The request body contains malformed JSON.",
    "Send valid JSON.",
  ),
  [RequestError.PARSE_UNSUPPORTED_OPTIONS]: entry(
    400,
    "Parse received unsupported options.",
    "Remove unsupported parse options.",
  ),
  [CommonError.UNKNOWN]: entry(
    500,
    "An unexpected server error occurred.",
    "Retry or contact support with the error id.",
  ),
} satisfies Record<ErrorCodes, ErrorCatalogEntry>;

export const WARNING_CATALOG = {
  [ScrapeWarning.ENGINE_PARTIAL_FEATURES]: warn(
    "The selected engine does not support every requested feature.",
    "Review the result and use supported formats/actions.",
  ),
  [LiveWarning.CAPTURE_UNAVAILABLE]: warn(
    "Live capture is unavailable for this request.",
    "Retry with a browser-capable local endpoint or disable live capture.",
  ),
  [LiveWarning.RECORDING_FAILED]: warn(
    "Live recording could not be saved.",
    "Review the local service logs or proceed with screenshot-only capture.",
  ),
  [LiveWarning.SCREENSHOT_FAILED]: warn(
    "Live screenshot capture failed.",
    "Retry the request or continue without the screenshot artifact.",
  ),
  [LiveWarning.WS_PROXY_FAILED]: warn(
    "Live view WebSocket proxy failed.",
    "Reconnect the viewer or retry the request.",
  ),
  [ExtractWarning.CONTENT_TRIMMED_CHARS]: warn(
    "Extraction input was trimmed by character limit.",
    "Reduce content size or split the request.",
  ),
  [ExtractWarning.CONTENT_TRIMMED_TOKENS]: warn(
    "Extraction input was trimmed by token limit.",
    "Reduce content size or split the request.",
  ),
  [ExtractWarning.TOKEN_COUNT_FAILED]: warn(
    "Token counting failed and fallback trimming was used.",
    "Reduce content size if results are incomplete.",
  ),
  [ExtractWarning.CLEANING_SKIPPED_TOO_LONG]: warn(
    "Content cleaning was skipped because input was too long.",
    "Reduce page content or omit cleaning.",
  ),
  [QueryWarning.ZDR_UNSUPPORTED]: warn(
    "Query mode is unavailable with ZDR.",
    "Disable ZDR or remove query mode.",
  ),
  [QueryWarning.NO_MARKDOWN]: warn(
    "Query mode requires markdown.",
    "Request markdown format.",
  ),
  [QueryWarning.EMPTY_MARKDOWN]: warn(
    "Query mode skipped empty markdown.",
    "Use a page with text content.",
  ),
  [QueryWarning.GENERATION_FAILED]: warn(
    "Query answer generation failed.",
    "Retry or simplify the query.",
  ),
  [QueryWarning.HIGHLIGHTS_FAILED]: warn(
    "Highlight generation failed.",
    "Retry or simplify the query.",
  ),
  [ChangeTrackingWarning.ZDR_UNSUPPORTED]: warn(
    "Change tracking is unavailable with ZDR.",
    "Disable ZDR or remove change tracking.",
  ),
  [ChangeTrackingWarning.COMPARE_FAILED]: warn(
    "Previous scrape comparison failed.",
    "Retry later.",
  ),
  [ChangeTrackingWarning.STRUCTURED_DIFF_FAILED]: warn(
    "Structured diff generation failed.",
    "Retry or simplify the diff request.",
  ),
  [MediaWarning.AUDIO_UNAVAILABLE]: warn(
    "Audio extraction is unavailable.",
    "Configure the media service or omit audio.",
  ),
  [MediaWarning.VIDEO_UNAVAILABLE]: warn(
    "Video extraction is unavailable.",
    "Configure the media service or omit video.",
  ),
  [MapWarning.NO_RESULTS]: warn(
    "Map returned no results.",
    "Start from a broader URL.",
  ),
  [MapWarning.SITEMAP_FAILED]: warn(
    "Sitemap discovery failed.",
    "Verify sitemap availability.",
  ),
  [CrawlWarning.FEW_RESULTS]: warn(
    "The crawl produced fewer results than expected.",
    "Use crawlEntireDomain or start from a higher-level path.",
  ),
} satisfies Record<WarningCodes, WarningCatalogEntry>;

const ERROR_CODE_SET: ReadonlySet<string> = new Set(Object.keys(ERROR_CATALOG));
const WARNING_CODE_SET: ReadonlySet<string> = new Set(
  Object.keys(WARNING_CATALOG),
);

export function errorCodeToHttpStatus(code: ErrorCodes): number {
  return ERROR_CATALOG[code].httpStatus;
}

export function explainError(code: ErrorCodes): ErrorCatalogEntry {
  return ERROR_CATALOG[code];
}

export function explainWarning(code: WarningCodes): WarningCatalogEntry {
  return WARNING_CATALOG[code];
}

export function parseErrorCode(s: string): ErrorCodes | undefined {
  return ERROR_CODE_SET.has(s) ? (s as ErrorCodes) : undefined;
}

export function parseWarningCode(s: string): WarningCodes | undefined {
  return WARNING_CODE_SET.has(s) ? (s as WarningCodes) : undefined;
}

export function makeWarning<C extends WarningCodes>(
  code: C,
  message: string,
  details?: WarningDetailsFor<C>,
): WarningOccurrence<C> {
  return details ? { code, message, details } : { code, message };
}
