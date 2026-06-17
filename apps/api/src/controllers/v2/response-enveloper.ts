import type { Request } from "express";
import { errorCodeToHttpStatus } from "../../lib/error-catalog";
import type { ErrorCodes } from "../../lib/error-codes";
import { CommonError } from "../../lib/error-codes";
import type { ErrorDetails } from "../../lib/error-details";
import type {
  AsyncJobFailureResponse,
  Diagnostics,
  ErrorResponse,
  ResponseCore,
  StrictErrorResponse,
  WarningEntry,
} from "./types";

type PrivacyMode = Diagnostics["privacy"]["mode"];

export type EnvelopeContext = {
  traceId?: string;
  zeroDataRetention?: boolean;
  privacyMode?: PrivacyMode;
  reducedDiagnostics?: boolean;
  durationMs?: number;
};

export type EnvelopeResult<TBody> = {
  httpStatus: number;
  body: TBody;
};

function requestTraceId(
  reqOrContext?: Request | EnvelopeContext,
): string | undefined {
  if (!reqOrContext) {
    return undefined;
  }

  if (!("header" in reqOrContext)) {
    return reqOrContext.traceId;
  }

  return (
    reqOrContext.header("x-request-id") ??
    reqOrContext.header("traceparent") ??
    (reqOrContext as any).id
  );
}

export function buildDiagnosticsPrivacy(
  reqOrContext?: Request | EnvelopeContext,
  opts: Partial<EnvelopeContext> = {},
): Diagnostics["privacy"] {
  const context =
    reqOrContext && "traceId" in reqOrContext ? reqOrContext : undefined;
  const zeroDataRetention =
    opts.zeroDataRetention ?? context?.zeroDataRetention ?? false;
  const mode =
    opts.privacyMode ??
    context?.privacyMode ??
    (zeroDataRetention ? "request" : "disabled");

  return {
    zeroDataRetention,
    mode,
    reduced:
      opts.reducedDiagnostics ??
      context?.reducedDiagnostics ??
      zeroDataRetention,
  };
}

export function diagnosticsForRequest(
  reqOrContext?: Request | EnvelopeContext,
  opts: Partial<EnvelopeContext> = {},
): Diagnostics {
  const privacy = buildDiagnosticsPrivacy(reqOrContext, opts);
  const traceId = opts.traceId ?? requestTraceId(reqOrContext);
  const durationMs =
    opts.durationMs ??
    (reqOrContext && "durationMs" in reqOrContext
      ? reqOrContext.durationMs
      : undefined);

  return {
    privacy,
    ...(privacy.zeroDataRetention ? {} : traceId ? { traceId } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

function statusForWarnings(warning?: string, warnings?: WarningEntry[]) {
  return warning || (warnings?.length ?? 0) > 0 ? "warning" : "ok";
}

export function okResponse<TBody extends Record<string, unknown>>(
  body: TBody,
  ctx: Request | EnvelopeContext,
): EnvelopeResult<TBody & ResponseCore> {
  const warning = typeof body.warning === "string" ? body.warning : undefined;
  const warnings = Array.isArray(body.warnings)
    ? (body.warnings as WarningEntry[])
    : undefined;

  return {
    httpStatus: 200,
    body: {
      ...body,
      success: true,
      status: statusForWarnings(warning, warnings),
      diagnostics: diagnosticsForRequest(ctx),
    } as TBody & ResponseCore,
  };
}

export function warningResponse<TBody extends Record<string, unknown>>(
  body: TBody,
  warnings: WarningEntry[],
  ctx: Request | EnvelopeContext,
): EnvelopeResult<TBody & ResponseCore> {
  return {
    httpStatus: 200,
    body: {
      ...body,
      success: true,
      status: "warning",
      warnings,
      diagnostics: diagnosticsForRequest(ctx),
    } as TBody & ResponseCore,
  };
}

export function errorResponse(
  code: ErrorCodes,
  error: string | Error,
  ctx: Request | EnvelopeContext,
  opts: {
    details?: ErrorDetails;
    errorId?: string;
    httpStatus?: number;
    sponsor_status?: string;
    login_url?: string;
  } = {},
): EnvelopeResult<ErrorResponse> {
  return {
    httpStatus: opts.httpStatus ?? errorCodeToHttpStatus(code),
    body: {
      success: false,
      status: "failed",
      code,
      error: typeof error === "string" ? error : error.message,
      diagnostics: diagnosticsForRequest(ctx),
      ...(opts.details !== undefined ? { details: opts.details } : {}),
      ...(opts.errorId ? { errorId: opts.errorId } : {}),
      ...(opts.sponsor_status ? { sponsor_status: opts.sponsor_status } : {}),
      ...(opts.login_url ? { login_url: opts.login_url } : {}),
    },
  };
}

export function asyncJobFailureResponse<TData = unknown>(
  code: ErrorCodes = CommonError.UNKNOWN,
  error: string | Error,
  ctx: Request | EnvelopeContext,
  opts: {
    details?: ErrorDetails;
    errorId?: string;
    data?: TData;
    failureCount?: number;
    failuresByCode?: Partial<Record<ErrorCodes, number>>;
    creditsUsed?: number;
    expiresAt?: string;
    createdAt?: string;
    completedAt?: string;
    duration?: number;
  } = {},
): EnvelopeResult<AsyncJobFailureResponse<TData>> {
  return {
    httpStatus: 200,
    body: {
      ...(errorResponse(code, error, ctx, {
        details: opts.details,
        errorId: opts.errorId,
      }).body as StrictErrorResponse),
      jobState: "failed",
      ...(opts.data !== undefined ? { data: opts.data } : {}),
      ...(opts.failureCount !== undefined
        ? { failureCount: opts.failureCount }
        : {}),
      ...(opts.failuresByCode ? { failuresByCode: opts.failuresByCode } : {}),
      ...(opts.creditsUsed !== undefined
        ? { creditsUsed: opts.creditsUsed }
        : {}),
      ...(opts.expiresAt ? { expiresAt: opts.expiresAt } : {}),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.completedAt ? { completedAt: opts.completedAt } : {}),
      ...(opts.duration !== undefined ? { duration: opts.duration } : {}),
    },
  };
}
