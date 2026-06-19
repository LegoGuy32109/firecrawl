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
  LiveWarning,
  MediaWarning,
  MonitorError,
  ProxyError,
  QueryWarning,
  RateError,
  RequestError,
  ScrapeError,
  ScrapeWarning,
  WarningCodes,
  ErrorCodes,
} from "./error-codes";
import type { ZodIssue } from "zod";

export type ActionStatus = {
  name: string;
  status: "ok" | "failed" | "skipped" | "timed_out";
  code?: string;
  message?: string;
  actionNumber?: number;
  durationMs?: number;
  startedAt?: string;
  endedAt?: string;
  details?: Record<string, unknown>;
};

export interface ErrorDetailsMap {
  [AuthError.INVALID_API_KEY]: { reason?: string };
  [AuthError.OAUTH_TOKEN_EXPIRED]: { provider?: string; expiredAt?: string };
  [AuthError.BACKEND_UNAVAILABLE]: { service?: string };
  [BillingError.INSUFFICIENT_CREDITS]: { balance?: number; required?: number };
  [BillingError.UNVERIFIED_CREDIT_LIMIT]: {
    balance?: number;
    required?: number;
  };
  [BillingError.SPONSOR_VERIFICATION_EXPIRED]: { expiredAt?: string };
  [BillingError.UNAVAILABLE]: { service?: string };
  [RateError.RATE_LIMIT_EXCEEDED]: { retryAfterMs?: number };
  [RateError.QUEUE_FULL]: { limit?: number; queued?: number };
  [GatingError.URL_BLOCKED]: { url?: string; reason?: string };
  [GatingError.COUNTRY_RESTRICTED]: { country?: string };
  [GatingError.IDEMPOTENCY_CONFLICT]: { key?: string };
  [LifecycleError.JOB_NOT_FOUND]: { jobId?: string };
  [LifecycleError.JOB_EXPIRED]: { jobId?: string; expiredAt?: string };
  [LifecycleError.JOB_WRONG_TEAM]: { jobId?: string; teamId?: string };
  [LifecycleError.JOB_CANCELLED]: { jobId?: string };
  [LifecycleError.ZDR_NOT_SUPPORTED]: { feature?: string };
  [CrawlError.DENIAL]: { reason: string };
  [ScrapeError.ALL_ENGINES_FAILED]: { enginesTried: string[] };
  [ScrapeError.SSL]: { skipTlsVerification: boolean };
  [ScrapeError.SITE]: { errorCode: string };
  [ScrapeError.PROXY_SELECTION]: { location?: string; proxyType?: string };
  [ScrapeError.PDF_PREFETCH_FAILED]: { url?: string };
  [ScrapeError.DOCUMENT_PREFETCH_FAILED]: { url?: string };
  [ScrapeError.RETRY_LIMIT]: {
    reason: string;
    stats: {
      totalAttempts: number;
      addFeatureAttempts: number;
      removeFeatureAttempts: number;
      pdfAntibotAttempts: number;
      documentAntibotAttempts: number;
    };
  };
  [ScrapeError.DNS]: { hostname: string };
  [ScrapeError.PDF_INSUFFICIENT_TIME]: {
    pageCount: number;
    minTimeout: number;
  };
  [ScrapeError.PDF_OCR_REQUIRED]: { pdfType: string };
  [ScrapeError.UNSUPPORTED_FILE]: {
    reason: string;
    contentType?: string;
    url?: string;
  };
  [ScrapeError.ACTION]: {
    errorCode: string;
    actionIndex?: number;
    actionNumber?: number;
    selector?: string;
    pageUrl?: string;
    screenshot?: string;
    actionType?: string;
    actionStatuses?: ActionStatus[];
  };
  [ScrapeError.RACED_REDIRECT]: { url?: string };
  [ScrapeError.SITEMAP]: { sitemapUrl?: string; cause?: unknown };
  [ScrapeError.ACTIONS_NOT_SUPPORTED]: { engine?: string };
  [ScrapeError.BRANDING_NOT_SUPPORTED]: {
    reason: "pdf" | "document" | "no_cdp_engine";
  };
  [ScrapeError.AUDIO_UNSUPPORTED_URL]: { reason?: string };
  [ScrapeError.VIDEO_UNSUPPORTED_URL]: { reason?: string };
  [ScrapeError.X_TWITTER_CONFIGURATION]: { missing?: string };
  [ExtractError.SCHEMA_MISMATCH]: { field: string; expected: string };
  [ExtractError.SCRAPE_FAILED]: { url: string; cause?: ErrorCodes };
  [AgentError.UPSTREAM]: { status: number; body?: string };
  [MapError.FAILED]: { source?: "index" | "sitemap" | "search" };
  [DependencyError.UNAVAILABLE]: {
    dependency: string;
    upstreamStatus?: number;
  };
  [DependencyError.TIMEOUT]: { dependency: string; timeoutMs?: number };
  [BrowserError.SESSION_EXPIRED]: { expiredAt: string };
  [BrowserError.SESSION_LIMIT_EXCEEDED]: { active: number; limit: number };
  [BrowserError.EXECUTION_FAILED]: {
    sessionId?: string;
    exitCode?: number;
    killed?: boolean;
    timedOut?: boolean;
    pageUrl?: string;
    screenshot?: string;
    replayFailedAt?: {
      actionIndex: number;
      actionNumber: number;
      actionType: string;
    };
    stderrSnippet?: string;
  };
  [BrowserError.SERVICE_UNAVAILABLE]: { dependency: "browser-service" };
  [MonitorError.EMAIL_TOKEN_EXPIRED]: { expiredAt: string };
  [MonitorError.CONFLICT]: { reason: string };
  [ProxyError.UPSTREAM_UNAVAILABLE]: { upstream: "support" | "research" };
  [ProxyError.UPSTREAM_TIMEOUT]: {
    upstream: "support" | "research";
    timeoutMs: number;
  };
  [ProxyError.UPSTREAM_BAD_RESPONSE]: {
    upstream: "support" | "research";
    upstreamStatus?: number;
  };
  [FeedbackError.WINDOW_EXPIRED]: { expiredAt?: string };
  [LocalError.FEATURE_UNSUPPORTED]: {
    feature: string;
    requiresEngine: "fire-engine";
  };
  [RequestError.BAD_REQUEST]: ZodIssue[];
  [CommonError.UNKNOWN]: { cause?: string };
}

export interface WarningDetailsMap {
  [ScrapeWarning.ENGINE_PARTIAL_FEATURES]: {
    unsupportedFeatures: string[];
    engine?: string;
  };
  [LiveWarning.CAPTURE_UNAVAILABLE]: {
    dependency?: "browser-service";
    reason?: string;
  };
  [LiveWarning.RECORDING_FAILED]: {
    path?: string;
    reason?: string;
  };
  [LiveWarning.SCREENSHOT_FAILED]: {
    path?: string;
    reason?: string;
  };
  [LiveWarning.WS_PROXY_FAILED]: {
    sessionId?: string;
    reason?: string;
  };
  [ExtractWarning.CONTENT_TRIMMED_CHARS]: { maxChars: number };
  [ExtractWarning.CONTENT_TRIMMED_TOKENS]: {
    numTokens: number;
    maxTokens: number;
    preTrimmed?: boolean;
  };
  [ExtractWarning.TOKEN_COUNT_FAILED]: { maxTokens: number };
  [ExtractWarning.CLEANING_SKIPPED_TOO_LONG]: {
    numTokens: number;
    maxOutputTokens: number;
  };
  [QueryWarning.ZDR_UNSUPPORTED]: { reason?: string };
  [QueryWarning.NO_MARKDOWN]: { url?: string };
  [QueryWarning.EMPTY_MARKDOWN]: { url?: string };
  [QueryWarning.GENERATION_FAILED]: { models: string[] };
  [QueryWarning.HIGHLIGHTS_FAILED]: { models: string[] };
  [ChangeTrackingWarning.ZDR_UNSUPPORTED]: { reason?: string };
  [ChangeTrackingWarning.COMPARE_FAILED]: { reason?: string };
  [ChangeTrackingWarning.STRUCTURED_DIFF_FAILED]: { reason?: string };
  [MediaWarning.AUDIO_UNAVAILABLE]: { reason: "not_configured" };
  [MediaWarning.VIDEO_UNAVAILABLE]: { reason: "not_configured" };
  [MapWarning.NO_RESULTS]: { query?: string };
  [MapWarning.SITEMAP_FAILED]: { sitemapUrl?: string };
  [CrawlWarning.FEW_RESULTS]: { resultCount: number; baseDomain?: string };
}

export type ErrorDetailsFor<C extends ErrorCodes> =
  C extends keyof ErrorDetailsMap ? ErrorDetailsMap[C] : undefined;

export type WarningDetailsFor<C extends WarningCodes> =
  C extends keyof WarningDetailsMap ? WarningDetailsMap[C] : undefined;

export type ErrorDetails = ErrorDetailsMap[keyof ErrorDetailsMap];
export type WarningDetails = WarningDetailsMap[keyof WarningDetailsMap];

export type ReplayFailedAt = {
  actionIndex: number;
  actionNumber: number;
  actionType: string;
};
