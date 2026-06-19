import { rewriteUrl } from "../../scraper/scrapeURL/lib/rewriteUrl";
import { ReplayFailedAt } from "../error-details";
import { BrowserServiceError } from "./browser-service-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapeContextRow {
  id: string;
  team_id: string;
  url: string | null;
  options: unknown;
}

type ReplayAction =
  | { type: "wait"; milliseconds?: number; selector?: string }
  | { type: "click"; selector: string; all?: boolean }
  | { type: "write"; text: string }
  | { type: "press"; key: string }
  | { type: "scroll"; direction?: "up" | "down"; selector?: string }
  | { type: "executeJavascript"; script: string }
  | { type: "screenshot" | "pdf" | "scrape" };

interface ScrapeReplayContext {
  targetUrl: string;
  waitForMs: number;
  actions: ReplayAction[];
  headers?: Record<string, string>;
  mobile?: boolean;
  location?: {
    country?: string;
    languages?: string[];
  };
  skipTlsVerification?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function clampPositiveInteger(value: unknown, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value <= 0) return undefined;
  return Math.min(Math.floor(value), max);
}

const REPLAY_FAILURE_SENTINEL = "__FIRECRAWL_REPLAY_FAILURE__";

function extractReplayFailureText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value instanceof BrowserServiceError) {
    if (value.bodyText) {
      try {
        const parsed = JSON.parse(value.bodyText) as { stderr?: unknown };
        if (typeof parsed.stderr === "string") return parsed.stderr;
      } catch {
        if (value.bodyText.trim()) return value.bodyText;
      }
    }
    return value.message || undefined;
  }
  if (value instanceof Error) return value.message;
  return undefined;
}

export function parseReplayFailure(value: unknown): ReplayFailedAt | undefined {
  const text = extractReplayFailureText(value);
  if (!text) return undefined;

  const marker = `${REPLAY_FAILURE_SENTINEL}:`;
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return undefined;

  const payloadText = text.slice(markerIndex + marker.length).trim();
  if (!payloadText) return undefined;

  try {
    const payload = JSON.parse(payloadText) as Partial<ReplayFailedAt>;
    if (
      typeof payload.actionIndex !== "number" ||
      typeof payload.actionType !== "string"
    ) {
      return undefined;
    }
    return {
      actionIndex: payload.actionIndex,
      actionNumber:
        typeof payload.actionNumber === "number"
          ? payload.actionNumber
          : payload.actionIndex + 1,
      actionType: payload.actionType,
    };
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Action sanitization
// ---------------------------------------------------------------------------

function sanitizeReplayActions(rawActions: unknown): ReplayAction[] {
  if (!Array.isArray(rawActions)) return [];

  const actions: ReplayAction[] = [];

  for (const rawAction of rawActions) {
    if (!isRecord(rawAction)) continue;
    const type = rawAction.type;

    if (type === "wait") {
      const milliseconds = clampPositiveInteger(rawAction.milliseconds, 60_000);
      const selector =
        typeof rawAction.selector === "string" &&
        rawAction.selector.trim().length > 0
          ? rawAction.selector
          : undefined;
      if (
        (milliseconds === undefined && !selector) ||
        (milliseconds && selector)
      ) {
        continue;
      }
      actions.push({
        type,
        ...(milliseconds !== undefined ? { milliseconds } : {}),
        ...(selector ? { selector } : {}),
      });
      continue;
    }

    if (type === "click") {
      if (
        typeof rawAction.selector !== "string" ||
        rawAction.selector.length === 0
      ) {
        continue;
      }
      actions.push({
        type,
        selector: rawAction.selector,
        all: rawAction.all === true,
      });
      continue;
    }

    if (type === "write") {
      if (typeof rawAction.text !== "string") continue;
      actions.push({ type, text: rawAction.text });
      continue;
    }

    if (type === "press") {
      if (typeof rawAction.key !== "string") continue;
      actions.push({ type, key: rawAction.key });
      continue;
    }

    if (type === "scroll") {
      const direction = rawAction.direction === "up" ? "up" : "down";
      const selector =
        typeof rawAction.selector === "string" &&
        rawAction.selector.trim().length > 0
          ? rawAction.selector
          : undefined;
      actions.push({
        type,
        direction,
        ...(selector ? { selector } : {}),
      });
      continue;
    }

    if (type === "executeJavascript") {
      if (typeof rawAction.script !== "string") continue;
      actions.push({ type, script: rawAction.script });
      continue;
    }

    if (type === "screenshot" || type === "pdf" || type === "scrape") {
      actions.push({ type });
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Build replay context from a saved scrape row
// ---------------------------------------------------------------------------

export function buildReplayContextFromScrape(scrape: ScrapeContextRow): {
  context?: ScrapeReplayContext;
  error?: string;
} {
  if (
    typeof scrape.url !== "string" ||
    scrape.url.trim().length === 0 ||
    scrape.url.startsWith("<redacted")
  ) {
    return {
      error:
        "Replay context is unavailable for this scrape job because the source URL was not retained.",
    };
  }

  if (!isRecord(scrape.options)) {
    return {
      error:
        "Replay context is unavailable for this scrape job because scrape options were not retained.",
    };
  }

  let targetUrl: string;
  try {
    targetUrl = rewriteUrl(scrape.url) ?? scrape.url;
  } catch {
    return {
      error:
        "Replay context is unavailable for this scrape job because the stored URL is invalid.",
    };
  }

  const replayOptions = scrape.options as Record<string, unknown>;
  const waitForMs = clampPositiveInteger(replayOptions.waitFor, 60_000) ?? 0;
  const actions = sanitizeReplayActions(replayOptions.actions);
  const headersOption = replayOptions.headers;
  const headers =
    isRecord(headersOption) &&
    Object.values(headersOption).every(value => typeof value === "string")
      ? (headersOption as Record<string, string>)
      : undefined;
  const mobileOption = replayOptions.mobile;
  const mobile = typeof mobileOption === "boolean" ? mobileOption : undefined;
  const skipTlsVerificationOption = replayOptions.skipTlsVerification;
  const skipTlsVerification =
    typeof skipTlsVerificationOption === "boolean"
      ? skipTlsVerificationOption
      : undefined;
  const locationOption = replayOptions.location;
  const location =
    isRecord(locationOption) &&
    (typeof locationOption.country === "string" ||
      Array.isArray(locationOption.languages))
      ? {
          ...(typeof locationOption.country === "string"
            ? { country: locationOption.country }
            : {}),
          ...(Array.isArray(locationOption.languages) &&
          locationOption.languages.every(
            language => typeof language === "string",
          )
            ? { languages: locationOption.languages }
            : {}),
        }
      : undefined;

  return {
    context: {
      targetUrl,
      waitForMs,
      actions,
      ...(headers ? { headers } : {}),
      ...(mobile !== undefined ? { mobile } : {}),
      ...(location ? { location } : {}),
      ...(skipTlsVerification !== undefined ? { skipTlsVerification } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Estimate timeout for the replay script
// ---------------------------------------------------------------------------

export function estimateReplayTimeoutSeconds(
  context: ScrapeReplayContext,
): number {
  const actionWaitMs = context.actions.reduce((total, action) => {
    if (action.type !== "wait") return total;
    if (typeof action.milliseconds === "number")
      return total + action.milliseconds;
    if (action.selector) return total + 1_000;
    return total;
  }, 0);

  const waitBudgetMs = context.waitForMs + actionWaitMs;
  return Math.min(300, Math.max(30, Math.ceil((waitBudgetMs + 45_000) / 1000)));
}

// ---------------------------------------------------------------------------
// Generate the Playwright replay script
// ---------------------------------------------------------------------------

export function buildReplayScript(context: ScrapeReplayContext): string {
  const payload = JSON.stringify(context);
  return `
const replay = ${payload};
const REPLAY_FAILURE_SENTINEL = ${JSON.stringify(REPLAY_FAILURE_SENTINEL)};

const failReplay = (actionIndex, actionType, error) => {
  const reason = error instanceof Error ? error.message : String(error ?? "unknown error");
  const actionNumber = actionIndex + 1;
  const structured = JSON.stringify({
    actionIndex,
    actionNumber,
    actionType,
    reason,
  });
  throw new Error(\`Replay action #\${actionNumber} (\${actionType}): \${reason} \${REPLAY_FAILURE_SENTINEL}:\${structured}\`);
};

const listReplayPages = () => page.context().pages().filter(candidate => !candidate.isClosed());

const candidateReplayPages = () => {
  const pages = listReplayPages();
  const nonExtensionPages = pages.filter(
    candidate => !candidate.url().startsWith("chrome-extension://"),
  );
  return nonExtensionPages.length > 0 ? nonExtensionPages : pages;
};

const syncReplayPage = async () => {
  const pages = candidateReplayPages();
  if (pages.length === 0) return;

  const isBlankLikeUrl = (url) => url === "" || url === "about:blank";

  let selected = null;

  for (let idx = pages.length - 1; idx >= 0; idx -= 1) {
    const candidate = pages[idx];
    const url = candidate.url();
    if (isBlankLikeUrl(url)) continue;
    try {
      const isVisible = await candidate.evaluate(
        () => document.visibilityState === "visible",
      );
      if (isVisible) {
        selected = candidate;
        break;
      }
    } catch {}
  }

  if (!selected) {
    for (let idx = pages.length - 1; idx >= 0; idx -= 1) {
      const candidate = pages[idx];
      if (!isBlankLikeUrl(candidate.url())) {
        selected = candidate;
        break;
      }
    }
  }

  if (!selected) {
    for (let idx = pages.length - 1; idx >= 0; idx -= 1) {
      const candidate = pages[idx];
      try {
        const isVisible = await candidate.evaluate(
          () => document.visibilityState === "visible",
        );
        if (isVisible) {
          selected = candidate;
          break;
        }
      } catch {}
    }
  }

  if (!selected) {
    selected = pages[pages.length - 1];
  }
  page = selected;

  try {
    await page.bringToFront();
  } catch {}
};

try {
  if (replay.headers && Object.keys(replay.headers).length > 0) {
    await page.setExtraHTTPHeaders(replay.headers);
  }
  await page.goto(replay.targetUrl, { waitUntil: "domcontentloaded" });
} catch (error) {
  throw new Error(\`Failed to load scrape URL: \${error instanceof Error ? error.message : String(error ?? "unknown error")}\`);
}

await syncReplayPage();

if (typeof replay.waitForMs === "number" && replay.waitForMs > 0) {
  await page.waitForTimeout(Math.min(replay.waitForMs, 30000));
}

for (let i = 0; i < replay.actions.length; i += 1) {
  const action = replay.actions[i];
  const step = \`Replay action #\${i + 1} (\${action.type})\`;

  try {
    await syncReplayPage();

    switch (action.type) {
      case "wait":
        if (typeof action.milliseconds === "number") {
          await page.waitForTimeout(Math.min(action.milliseconds, 60000));
        } else if (typeof action.selector === "string") {
          await page.waitForSelector(action.selector, { timeout: 60000 });
        }
        break;
      case "click":
        if (action.all) {
          const locator = page.locator(action.selector);
          const count = await locator.count();
          for (let idx = 0; idx < count; idx += 1) {
            await locator.nth(idx).click();
          }
        } else {
          await page.click(action.selector);
        }
        break;
      case "write":
        await page.keyboard.type(action.text);
        break;
      case "press":
        await page.keyboard.press(action.key);
        break;
      case "scroll":
        if (typeof action.selector === "string") {
          await page.evaluate(
            ({ selector, direction }) => {
              const el = document.querySelector(selector);
              if (!el) {
                throw new Error(\`Selector not found: \${selector}\`);
              }
              const delta = direction === "up" ? -window.innerHeight : window.innerHeight;
              if (typeof el.scrollBy === "function") {
                el.scrollBy(0, delta);
              } else {
                window.scrollBy(0, delta);
              }
            },
            { selector: action.selector, direction: action.direction ?? "down" },
          );
        } else {
          await page.mouse.wheel(0, action.direction === "up" ? -800 : 800);
        }
        break;
      case "executeJavascript": {
        const wrapped = \`(async () => { \${action.script} })()\`;
        await page.evaluate(script => (0, eval)(script), wrapped);
        break;
      }
      case "screenshot":
      case "pdf":
      case "scrape":
        console.log(\`[firecrawl-replay] skipping output-only action: \${action.type}\`);
        break;
      default:
        console.log(\`[firecrawl-replay] skipping unsupported action type: \${String(action.type)}\`);
        break;
    }

    await syncReplayPage();
  } catch (error) {
    failReplay(i, action.type, error);
  }
}

await syncReplayPage();
`;
}
