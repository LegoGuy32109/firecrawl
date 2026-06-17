import { CommonError, CrawlError, MapError, ScrapeError } from "./error-codes";
import type { ErrorCodes } from "./error-codes";
import type { ErrorDetails } from "./error-details";

export type { ErrorCodes } from "./error-codes";

export function restoreTransportableError<T extends TransportableError>(
  error: T,
  data: { stack?: string; details?: ErrorDetails },
): T {
  error.stack = data.stack;
  Object.assign(error, { details: data.details });
  return error;
}

export class TransportableError extends Error {
  public readonly code: ErrorCodes;
  public readonly details?: ErrorDetails;

  constructor(
    code: ErrorCodes,
    message?: string,
    options?: ErrorOptions & { details?: ErrorDetails },
  ) {
    super(message, options);
    this.code = code;
    this.details = options?.details;
  }

  serialize() {
    return {
      cause: this.cause,
      stack: this.stack,
      message: this.message,
      details: this.details,
    };
  }

  static deserialize(
    code: ErrorCodes,
    data: ReturnType<typeof this.prototype.serialize>,
  ) {
    return restoreTransportableError(
      new TransportableError(code, data.message, {
        cause: data.cause,
        details: data.details,
      }),
      data,
    );
  }
}

export class ScrapeJobTimeoutError extends TransportableError {
  constructor(
    message: string = "The scrape operation timed out before completing. This happens when a page takes too long to load, render, or process. Possible causes: (1) The website is slow or unresponsive, (2) The page has heavy JavaScript that takes time to execute, (3) The page is very large or has many resources to load, (4) Network latency is high. To fix this, try increasing the timeout parameter in your scrape request, or if using actions, ensure your selectors are correct and the page is ready before actions are executed.",
  ) {
    super(ScrapeError.TIMEOUT, message);
  }

  serialize() {
    return super.serialize();
  }

  static deserialize(
    _code: ErrorCodes,
    data: ReturnType<typeof this.prototype.serialize>,
  ) {
    const x = new ScrapeJobTimeoutError(data.message);
    return restoreTransportableError(x, data);
  }
}

export class UnknownError extends TransportableError {
  constructor(inner: unknown) {
    const innerMessage =
      inner && inner instanceof Error ? inner.message : String(inner);
    super(
      CommonError.UNKNOWN,
      `An unexpected internal error occurred while processing your request. Error details: "${innerMessage}". This is typically a temporary issue. Please try your request again. If the problem persists, contact support with your request ID and this error message for investigation.`,
    );

    if (inner instanceof Error) {
      this.stack = inner.stack;
    }
  }

  serialize() {
    return super.serialize();
  }

  static deserialize(
    _code: ErrorCodes,
    data: ReturnType<typeof this.prototype.serialize>,
  ) {
    const x = new UnknownError("dummy");
    x.message = data.message;
    return restoreTransportableError(x, data);
  }
}

export class MapTimeoutError extends TransportableError {
  constructor() {
    super(
      MapError.TIMEOUT,
      "The map operation timed out before completing. This happens when discovering URLs on a large website takes too long. Try using a more specific starting URL, or increase the timeout parameter if available.",
    );
  }

  serialize() {
    return super.serialize();
  }

  static deserialize(
    _code: ErrorCodes,
    data: ReturnType<typeof this.prototype.serialize>,
  ) {
    const x = new MapTimeoutError();
    return restoreTransportableError(x, data);
  }
}

export class MapFailedError extends TransportableError {
  constructor(message: string) {
    super(MapError.FAILED, message);
  }

  serialize() {
    return super.serialize();
  }

  static deserialize(
    _code: ErrorCodes,
    data: ReturnType<typeof this.prototype.serialize>,
  ) {
    const x = new MapFailedError(data.message);
    return restoreTransportableError(x, data);
  }
}

export class RacedRedirectError extends TransportableError {
  constructor() {
    super(
      ScrapeError.RACED_REDIRECT,
      "This URL was not scraped because another scrape job in this same crawl or batch scrape has already scraped this URL (usually due to a redirect). This is an expected error used to prevent duplicate scrapes of the same URL and ensure efficiency. No action is needed - the content is already captured by the other scrape job.",
    );
  }

  serialize() {
    return super.serialize();
  }

  static deserialize(
    _: ErrorCodes,
    data: ReturnType<typeof this.prototype.serialize>,
  ) {
    const x = new RacedRedirectError();
    return restoreTransportableError(x, data);
  }
}

export class SitemapError extends TransportableError {
  constructor(message: string, cause?: unknown) {
    super(ScrapeError.SITEMAP, message, { cause });
  }

  serialize() {
    return super.serialize();
  }

  static deserialize(
    _: ErrorCodes,
    data: ReturnType<typeof this.prototype.serialize>,
  ) {
    const x = new SitemapError(data.message, data.cause);
    return restoreTransportableError(x, data);
  }
}

export class CrawlDenialError extends TransportableError {
  constructor(public reason: string) {
    super(CrawlError.DENIAL, reason, { details: { reason } });
  }

  serialize() {
    return {
      ...super.serialize(),
      reason: this.reason,
    };
  }

  static deserialize(
    _: ErrorCodes,
    data: ReturnType<typeof this.prototype.serialize> & { reason: string },
  ) {
    const x = new CrawlDenialError(data.reason);
    return restoreTransportableError(x, data);
  }
}

export class ActionsNotSupportedError extends TransportableError {
  constructor(message: string) {
    super(ScrapeError.ACTIONS_NOT_SUPPORTED, message);
  }

  serialize() {
    return super.serialize();
  }

  static deserialize(
    _: ErrorCodes,
    data: ReturnType<typeof this.prototype.serialize>,
  ) {
    const x = new ActionsNotSupportedError(data.message);
    return restoreTransportableError(x, data);
  }
}

/**
 * Error thrown when a job is cancelled (expected flow control, not a real error)
 * This should not be sent to Sentry as it's expected behavior when a crawl/batch is cancelled
 */
export class JobCancelledError extends Error {
  constructor() {
    super(
      "This scrape was not completed because the parent crawl or batch scrape was cancelled. This happens when you call the cancel endpoint on a crawl or batch scrape, or when the operation is stopped for another reason. Any URLs that were already scraped before cancellation are still available in the results.",
    );
    this.name = "JobCancelledError";
  }
}
