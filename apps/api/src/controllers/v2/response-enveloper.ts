import type { Request } from "express";
import { errorCodeToHttpStatus } from "../../lib/error-catalog";
import type { ErrorCodes } from "../../lib/error-codes";
import { CommonError } from "../../lib/error-codes";
import type { ErrorDetails } from "../../lib/error-details";
import type {
  AsyncJobFailureResponse,
  Diagnostics,
  ErrorResponse,
  DiagnosticStep,
  ResponseCore,
  StrictErrorResponse,
  WarningEntry,
} from "./types";

type PrivacyMode = Diagnostics["privacy"]["mode"];

type EnvelopeContext = {
  traceId?: string;
  zeroDataRetention?: boolean;
  privacyMode?: PrivacyMode;
  reducedDiagnostics?: boolean;
  durationMs?: number;
};

type DiagnosticStepInput = {
  name: string;
  status: DiagnosticStep["status"];
  code?: DiagnosticStep["code"];
  message?: string;
  messageTemplate?: string;
  details?: Record<string, unknown>;
  durationMs?: number;
  startedAt?: string;
  endedAt?: string;
};

type EnvelopeResult<TBody> = {
  httpStatus: number;
  body: TBody;
};

function isRequest(
  reqOrContext?: Request | EnvelopeContext,
): reqOrContext is Request {
  return Boolean(reqOrContext && "header" in reqOrContext);
}

function getEnvelopeContext(
  reqOrContext?: Request | EnvelopeContext,
): EnvelopeContext | undefined {
  return reqOrContext && !isRequest(reqOrContext) ? reqOrContext : undefined;
}

function requestTraceId(
  reqOrContext?: Request | EnvelopeContext,
): string | undefined {
  if (!reqOrContext) {
    return undefined;
  }

  if (!isRequest(reqOrContext)) {
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
  const context = getEnvelopeContext(reqOrContext);
  const zeroDataRetention =
    opts.zeroDataRetention ?? context?.zeroDataRetention ?? false;
  const mode =
    opts.privacyMode ??
    context?.privacyMode ??
    (zeroDataRetention ? "request" : "disabled");
  const reduced = mode === "forced" || mode === "request";

  return {
    zeroDataRetention,
    mode,
    reduced,
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
    (reqOrContext && !isRequest(reqOrContext) && "durationMs" in reqOrContext
      ? reqOrContext.durationMs
      : undefined);

  return {
    privacy,
    ...(privacy.zeroDataRetention ? {} : traceId ? { traceId } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
  };
}

const CONTROLLED_DIAGNOSTIC_STEP_NAMES = new Set([
  "request",
  "response",
  "handler",
  "job",
  "source",
  "sources",
  "action",
  "actions",
  "warning",
  "error",
  "scrape",
  "extract",
  "query",
  "crawl",
  "map",
  "browser",
  "agent",
  "auth",
  "billing",
  "rate",
  "gating",
  "dependency",
  "proxy",
  "validation",
  "parse",
  "compare",
  "cleanup",
  "generation",
  "highlight",
  "sitemap",
  "dns",
]);

const CONTROLLED_DIAGNOSTIC_STATUSES: DiagnosticStep["status"][] = [
  "ok",
  "warning",
  "failed",
  "skipped",
  "timed_out",
];

function normalizeDiagnosticStepName(name: string): string {
  return CONTROLLED_DIAGNOSTIC_STEP_NAMES.has(name) ? name : "response";
}

function normalizeDiagnosticStepStatus(
  status: string,
): DiagnosticStep["status"] {
  return CONTROLLED_DIAGNOSTIC_STATUSES.includes(
    status as DiagnosticStep["status"],
  )
    ? (status as DiagnosticStep["status"])
    : "skipped";
}

// Steps are written through this projection so reduced diagnostics can never leak raw text.
function buildDiagnosticStep(
  step: DiagnosticStepInput,
  privacy: Diagnostics["privacy"],
): DiagnosticStep {
  const message = privacy.reduced
    ? step.messageTemplate
    : (step.message ?? step.messageTemplate);

  return {
    name: normalizeDiagnosticStepName(step.name),
    status: normalizeDiagnosticStepStatus(step.status),
    ...(step.code !== undefined ? { code: step.code } : {}),
    ...(step.durationMs !== undefined ? { durationMs: step.durationMs } : {}),
    ...(step.startedAt ? { startedAt: step.startedAt } : {}),
    ...(step.endedAt ? { endedAt: step.endedAt } : {}),
    ...(message ? { message } : {}),
    ...(privacy.reduced
      ? {}
      : step.details !== undefined
        ? { details: step.details }
        : {}),
  };
}

export function addStep(
  diagnostics: Diagnostics,
  step: DiagnosticStepInput,
  target: "steps" | "sources" | "actions" = "steps",
  key?: string,
): Diagnostics {
  const privacy = diagnostics.privacy;
  const sanitizedStep = buildDiagnosticStep(step, privacy);

  if (target === "sources") {
    const sourceKey = key ?? sanitizedStep.name;
    return {
      ...diagnostics,
      sources: {
        ...(diagnostics.sources ?? {}),
        [sourceKey]: sanitizedStep,
      },
    };
  }

  return {
    ...diagnostics,
    [target]: [...(diagnostics[target] ?? []), sanitizedStep],
  };
}

function statusForWarnings(warning?: string, warnings?: WarningEntry[]) {
  return warning || (warnings?.length ?? 0) > 0 ? "warning" : "ok";
}

export function okResponse<TBody extends Record<string, unknown>>(
  body: TBody,
  ctx: Request | EnvelopeContext,
): EnvelopeResult<
  TBody & ResponseCore & { success: true; status: "ok" | "warning" }
> {
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
    } as TBody & ResponseCore & { success: true; status: "ok" | "warning" },
  };
}

export function warningResponse<TBody extends Record<string, unknown>>(
  body: TBody,
  warnings: WarningEntry[],
  ctx: Request | EnvelopeContext,
): EnvelopeResult<TBody & ResponseCore & { success: true; status: "warning" }> {
  return {
    httpStatus: 200,
    body: {
      ...body,
      success: true,
      status: "warning",
      warnings,
      diagnostics: diagnosticsForRequest(ctx),
    } as TBody & ResponseCore & { success: true; status: "warning" },
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
