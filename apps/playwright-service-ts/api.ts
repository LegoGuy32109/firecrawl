import express, { Request, Response } from "express";
import http from "http";
import {
  chromium,
  Browser,
  BrowserContext,
  Route,
  Request as PlaywrightRequest,
  Page,
} from "playwright";
import dotenv from "dotenv";
import UserAgent from "user-agents";
import { getError } from "./helpers/get_error";
import { lookup } from "dns/promises";
import IPAddr from "ipaddr.js";
import { copyFile, mkdir, readFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";

dotenv.config();

const app = express();
const port = process.env.PORT || 3003;

app.use(express.json());

const BROWSER_SERVICE_API_KEY = process.env.BROWSER_SERVICE_API_KEY || null;

function isBrowserServiceAuthorized(req: Request): boolean {
  if (!BROWSER_SERVICE_API_KEY) return true;
  const header = req.header("authorization") ?? "";
  return header === `Bearer ${BROWSER_SERVICE_API_KEY}`;
}

function requireBrowserServiceAuth(
  req: Request,
  res: Response,
  next: Function,
) {
  if (!isBrowserServiceAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const BLOCK_MEDIA =
  (process.env.BLOCK_MEDIA || "False").toUpperCase() === "TRUE";
const MAX_CONCURRENT_PAGES = Math.max(
  1,
  Number.parseInt(process.env.MAX_CONCURRENT_PAGES ?? "10", 10) || 10,
);
const ALLOW_LOCAL_WEBHOOKS =
  (process.env.ALLOW_LOCAL_WEBHOOKS || "False").toUpperCase() === "TRUE";
const DNS_CACHE_TTL_MS = 30_000;

const PROXY_SERVER = process.env.PROXY_SERVER || null;
const PROXY_USERNAME = process.env.PROXY_USERNAME || null;
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || null;
const dnsLookupCache = new Map<
  string,
  { addresses: string[]; expiresAt: number }
>();

class InsecureConnectionError extends Error {
  constructor(
    public readonly blockedUrl: string,
    reason: string,
  ) {
    super(`Blocked insecure target URL "${blockedUrl}": ${reason}`);
    this.name = "InsecureConnectionError";
  }
}

const normalizeHostname = (hostname: string): string =>
  hostname.toLowerCase().replace(/\.$/, "");

const isHttpProtocol = (protocol: string): boolean =>
  protocol === "http:" || protocol === "https:";

const isIPPrivate = (address: string): boolean => {
  if (!IPAddr.isValid(address)) return false;
  const parsedAddress = IPAddr.parse(address);
  return parsedAddress.range() !== "unicast";
};

const isLocalHostname = (hostname: string): boolean =>
  hostname === "localhost" || hostname.endsWith(".localhost");

const lookupWithCache = async (hostname: string): Promise<string[]> => {
  const cached = dnsLookupCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.addresses;
  }

  const resolvedAddresses = await lookup(hostname, {
    all: true,
    verbatim: true,
  });
  const uniqueAddresses = [...new Set(resolvedAddresses.map((x) => x.address))];
  dnsLookupCache.set(hostname, {
    addresses: uniqueAddresses,
    expiresAt: Date.now() + DNS_CACHE_TTL_MS,
  });
  return uniqueAddresses;
};

const assertSafeTargetUrl = async (urlString: string): Promise<void> => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString);
  } catch {
    throw new InsecureConnectionError(urlString, "URL is invalid");
  }

  if (!isHttpProtocol(parsedUrl.protocol)) {
    throw new InsecureConnectionError(
      urlString,
      `unsupported protocol "${parsedUrl.protocol}"`,
    );
  }

  if (ALLOW_LOCAL_WEBHOOKS) {
    return;
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  if (!hostname) {
    throw new InsecureConnectionError(urlString, "hostname is missing");
  }

  if (isLocalHostname(hostname)) {
    throw new InsecureConnectionError(
      urlString,
      "localhost targets are not allowed",
    );
  }

  if (IPAddr.isValid(hostname)) {
    if (isIPPrivate(hostname)) {
      throw new InsecureConnectionError(
        urlString,
        `private IP "${hostname}" is not allowed`,
      );
    }
    return;
  }

  let resolvedAddresses: string[];
  try {
    resolvedAddresses = await lookupWithCache(hostname);
  } catch {
    throw new InsecureConnectionError(
      urlString,
      `DNS lookup failed for "${hostname}", cannot verify target is safe`,
    );
  }

  if (resolvedAddresses.length === 0) {
    throw new InsecureConnectionError(
      urlString,
      `hostname "${hostname}" did not resolve to any IP address`,
    );
  }

  if (resolvedAddresses.some((address) => isIPPrivate(address))) {
    throw new InsecureConnectionError(
      urlString,
      `hostname "${hostname}" resolves to a private IP`,
    );
  }
};

type ContextSecurityState = {
  blockedNavigationRequestUrl: string | null;
};
class Semaphore {
  private permits: number;
  private queue: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.queue.length > 0) {
      const nextResolve = this.queue.shift();
      if (nextResolve) {
        this.permits--;
        nextResolve();
      }
    }
  }

  getAvailablePermits(): number {
    return this.permits;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}
const pageSemaphore = new Semaphore(MAX_CONCURRENT_PAGES);

const AD_SERVING_DOMAINS = [
  "doubleclick.net",
  "adservice.google.com",
  "googlesyndication.com",
  "googletagservices.com",
  "googletagmanager.com",
  "google-analytics.com",
  "adsystem.com",
  "adservice.com",
  "adnxs.com",
  "ads-twitter.com",
  "facebook.net",
  "fbcdn.net",
  "amazon-adsystem.com",
];

interface UrlModel {
  url: string;
  wait_after_load?: number;
  timeout?: number;
  headers?: { [key: string]: string };
  check_selector?: string;
  skip_tls_verification?: boolean;
  screenshot?: boolean;
  full_page_screenshot?: boolean;
  screenshot_quality?: number;
  screenshot_viewport?: {
    width: number;
    height: number;
  };
  mobile?: boolean;
  location?: {
    country?: string;
    languages?: string[];
  };
  actions?: ScrapeAction[];
}

interface BrowserCreateRequest {
  ttl?: number;
  activityTtl?: number;
  streamWebView?: boolean;
  persistentStorage?: { uniqueId: string; write: boolean };
}

interface BrowserExecRequest {
  code: string;
  language?: "python" | "node" | "bash";
  timeout?: number;
  origin?: string;
}

interface BrowserServiceCreateResponse {
  sessionId: string;
  cdpUrl: string;
  viewUrl: string;
  iframeUrl: string;
  interactiveIframeUrl: string;
  expiresAt: string;
  live?: {
    mode: "single";
    status: "streaming" | "completed" | "unavailable" | "warning";
    sessionId?: string;
    liveViewUrl?: string;
    liveViewWsUrl?: string;
    screenshotUrl?: string;
    recordingUrl?: string;
    framesCaptured?: number;
    recordingDurationMs?: number;
    warning?: string;
    warnings?: Array<{
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }>;
  };
}

interface BrowserServiceExecResponse {
  stdout: string;
  result: string;
  stderr: string;
  exitCode: number;
  killed: boolean;
}

interface BrowserServiceDeleteResponse {
  ok: boolean;
  sessionDurationMs?: number;
  screenshotUrl?: string;
  recordingUrl?: string;
  framesCaptured?: number;
  recordingDurationMs?: number;
  live?: {
    mode: "single";
    status: "streaming" | "completed" | "unavailable" | "warning";
    sessionId?: string;
    liveViewUrl?: string;
    liveViewWsUrl?: string;
    screenshotUrl?: string;
    recordingUrl?: string;
    framesCaptured?: number;
    recordingDurationMs?: number;
    warning?: string;
    warnings?: Array<{
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }>;
  };
}

let browser: Browser;
const nodeRequire = createRequire(__filename);
const { WebSocketServer, WebSocket } = require("ws");

type ScreencastFrameEnvelope = {
  type: "frame";
  mimeType: "image/jpeg";
  data: string;
  frameIndex: number;
  timestamp: number;
};

type LiveSessionRecord = {
  sessionId: string;
  context: BrowserContext;
  page: Page;
  cdp: any;
  clients: Set<any>;
  latestFrame: ScreencastFrameEnvelope | null;
  frameCount: number;
  createdAt: number;
  artifactDir: string;
  screenshotPath: string | null;
  recordingPath: string | null;
  recordingEnabled: boolean;
  interactive: boolean;
};

type ScrapeArtifactRecord = {
  artifactDir: string;
  screenshotPath?: string;
  recordingPath?: string;
};

const browserSessions = new Map<string, LiveSessionRecord>();
const scrapeArtifacts = new Map<string, ScrapeArtifactRecord>();
const serviceArtifactRoot = path.join(
  os.tmpdir(),
  "firecrawl-playwright-service",
);

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

function browserSessionArtifactPath(sessionId: string, name: string): string {
  return path.join(serviceArtifactRoot, "browser", sessionId, name);
}

function scrapeSessionArtifactPath(scrapeId: string, name: string): string {
  return path.join(serviceArtifactRoot, "scrape", scrapeId, name);
}

function browserLivePath(sessionId: string): string {
  return `/browsers/${encodeURIComponent(sessionId)}/view`;
}

function browserLiveWsPath(sessionId: string): string {
  return `/browsers/${encodeURIComponent(sessionId)}/view/ws`;
}

function browserArtifactUrl(sessionId: string, name: string): string {
  return `/browsers/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(name)}`;
}

function scrapeArtifactUrl(scrapeId: string, name: string): string {
  return `/scrapes/${encodeURIComponent(scrapeId)}/artifacts/${encodeURIComponent(name)}`;
}

function apiBrowserLiveViewPath(sessionId: string): string {
  return `/v2/live/browser/${encodeURIComponent(sessionId)}/view`;
}

function apiBrowserLiveWsPath(sessionId: string): string {
  return `/v2/live/browser/${encodeURIComponent(sessionId)}/ws`;
}

function apiBrowserArtifactPath(sessionId: string, name: string): string {
  return `/v2/live/browser/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(name)}`;
}

function apiScrapeArtifactPath(scrapeId: string, name: string): string {
  return `/v2/live/scrape/${encodeURIComponent(scrapeId)}/artifacts/${encodeURIComponent(name)}`;
}

function serializeValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function appendLiveWarning(
  warnings: Array<{
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }>,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  warnings.push({ code, message, ...(details ? { details } : {}) });
}

function buildLiveMetadata(
  kind: "browser" | "scrape",
  id: string,
  status: "streaming" | "completed" | "unavailable" | "warning",
  extra: Partial<{
    screenshotUrl: string;
    recordingUrl: string;
    framesCaptured: number;
    recordingDurationMs: number;
    warning: string;
    warnings: Array<{
      code: string;
      message: string;
      details?: Record<string, unknown>;
    }>;
    error: {
      code?: string;
      message: string;
      details?: Record<string, unknown>;
    };
  }> = {},
) {
  const base =
    kind === "browser"
      ? {
          sessionId: id,
          liveViewUrl: apiBrowserLiveViewPath(id),
          liveViewWsUrl: apiBrowserLiveWsPath(id),
        }
      : {
          scrapeId: id,
        };

  return {
    mode: "single" as const,
    status,
    ...base,
    ...(extra.warning ? { warning: extra.warning } : {}),
    ...(extra.warnings ? { warnings: extra.warnings } : {}),
    ...(extra.error ? { error: extra.error } : {}),
    ...(extra.screenshotUrl ? { screenshotUrl: extra.screenshotUrl } : {}),
    ...(extra.recordingUrl ? { recordingUrl: extra.recordingUrl } : {}),
    ...(extra.framesCaptured !== undefined
      ? { framesCaptured: extra.framesCaptured }
      : {}),
    ...(extra.recordingDurationMs !== undefined
      ? { recordingDurationMs: extra.recordingDurationMs }
      : {}),
  };
}

async function captureBrowserArtifacts(session: LiveSessionRecord) {
  const warnings: Array<{
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }> = [];
  let screenshotUrl: string | undefined;
  let recordingUrl: string | undefined;
  let recordingDurationMs: number | undefined;

  try {
    const screenshotPath = browserSessionArtifactPath(
      session.sessionId,
      "final.jpeg",
    );
    await session.page.screenshot({ path: screenshotPath, type: "jpeg" });
    session.screenshotPath = screenshotPath;
    screenshotUrl = apiBrowserArtifactPath(session.sessionId, "final.jpeg");
  } catch (error) {
    appendLiveWarning(
      warnings,
      "LIVE_SCREENSHOT_FAILED",
      "Final screenshot capture failed.",
      {
        sessionId: session.sessionId,
        reason: error instanceof Error ? error.message : String(error),
      },
    );
  }

  return {
    screenshotUrl,
    recordingUrl,
    recordingDurationMs,
    warnings,
  };
}

async function startBrowserScreencast(session: LiveSessionRecord) {
  session.cdp = await session.context.newCDPSession(session.page);
  await session.cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 80,
    everyNthFrame: 1,
  });

  session.cdp.on("Page.screencastFrame", async (event: any) => {
    session.frameCount += 1;
    const envelope: ScreencastFrameEnvelope = {
      type: "frame",
      mimeType: "image/jpeg",
      data: event.data,
      frameIndex: session.frameCount,
      timestamp: Date.now(),
    };
    session.latestFrame = envelope;
    for (const client of session.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(envelope));
      }
    }
    try {
      await session.cdp.send("Page.screencastFrameAck", {
        sessionId: event.sessionId,
      });
    } catch {}
  });
}

function attachBrowserSessionClient(session: LiveSessionRecord, client: any) {
  session.clients.add(client);
  client.send(
    JSON.stringify({
      type: "status",
      status: "streaming",
      sessionId: session.sessionId,
      frameCount: session.frameCount,
    }),
  );
  if (session.latestFrame) {
    client.send(JSON.stringify(session.latestFrame));
  } else {
    void (async () => {
      try {
        const screenshot = await session.page.screenshot({
          type: "jpeg",
          quality: 80,
        });
        const envelope: ScreencastFrameEnvelope = {
          type: "frame",
          mimeType: "image/jpeg",
          data: screenshot.toString("base64"),
          frameIndex: session.frameCount + 1,
          timestamp: Date.now(),
        };
        session.latestFrame = envelope;
        session.frameCount = envelope.frameIndex;
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(envelope));
        }
      } catch {}
    })();
  }
  client.on("close", () => {
    session.clients.delete(client);
  });
}

type ScrapeAction =
  | { type: "wait"; milliseconds?: number; selector?: string }
  | { type: "click"; selector: string; all?: boolean }
  | {
      type: "screenshot";
      fullPage?: boolean;
      quality?: number;
      viewport?: { width: number; height: number };
    }
  | { type: "write"; text: string }
  | { type: "press"; key: string }
  | { type: "scroll"; direction?: "up" | "down"; selector?: string }
  | { type: "scrape" }
  | { type: "executeJavascript"; script: string };

type ActionResult =
  | { type: "scrape"; content: string }
  | { type: "screenshot"; screenshot: string }
  | { type: "executeJavascript"; value: unknown };

type ActionStatus = {
  name: string;
  status: "ok" | "failed" | "skipped" | "timed_out";
  code?: string;
  message?: string;
  durationMs?: number;
  startedAt?: string;
  endedAt?: string;
  details?: Record<string, unknown>;
};

class ScrapeActionError extends Error {
  constructor(
    public readonly actionIndex: number,
    public readonly action: ScrapeAction,
    public readonly actionStatuses: ActionStatus[] | undefined,
    cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "ScrapeActionError";
  }
}

const initializeBrowser = async () => {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  });
};

const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const geolocationByCountry: Record<
  string,
  { latitude: number; longitude: number }
> = {
  US: { latitude: 37.7749, longitude: -122.4194 },
  CA: { latitude: 43.6532, longitude: -79.3832 },
  DE: { latitude: 52.52, longitude: 13.405 },
  GB: { latitude: 51.5074, longitude: -0.1278 },
  FR: { latitude: 48.8566, longitude: 2.3522 },
  JP: { latitude: 35.6762, longitude: 139.6503 },
};

const createContext = async (
  skipTlsVerification: boolean = false,
  userAgentOverride?: string,
  mobile: boolean = false,
  location?: UrlModel["location"],
  recordVideoDir?: string,
  viewportOverride?: { width: number; height: number },
): Promise<{
  context: BrowserContext;
  securityState: ContextSecurityState;
}> => {
  const userAgent =
    userAgentOverride ||
    (mobile ? MOBILE_USER_AGENT : new UserAgent().toString());
  const viewport =
    viewportOverride ??
    (mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  const securityState: ContextSecurityState = {
    blockedNavigationRequestUrl: null,
  };

  const contextOptions: any = {
    userAgent,
    viewport,
    ignoreHTTPSErrors: skipTlsVerification,
    serviceWorkers: "block",
  };

  if (recordVideoDir) {
    contextOptions.recordVideo = {
      dir: recordVideoDir,
      size: viewport,
    };
  }

  if (mobile) {
    contextOptions.isMobile = true;
    contextOptions.hasTouch = true;
    contextOptions.deviceScaleFactor = 3;
  }

  if (location?.country) {
    contextOptions.geolocation = geolocationByCountry[
      location.country.toUpperCase()
    ] ?? {
      latitude: 0,
      longitude: 0,
    };
    contextOptions.permissions = ["geolocation"];
  }

  if (location?.languages?.length) {
    contextOptions.locale = location.languages[0];
  }

  if (PROXY_SERVER && PROXY_USERNAME && PROXY_PASSWORD) {
    contextOptions.proxy = {
      server: PROXY_SERVER,
      username: PROXY_USERNAME,
      password: PROXY_PASSWORD,
    };
  } else if (PROXY_SERVER) {
    contextOptions.proxy = {
      server: PROXY_SERVER,
    };
  }

  const newContext = await browser.newContext(contextOptions);

  if (BLOCK_MEDIA) {
    await newContext.route(
      "**/*.{png,jpg,jpeg,gif,svg,mp3,mp4,avi,flac,ogg,wav,webm}",
      async (route: Route, request: PlaywrightRequest) => {
        await route.abort();
      },
    );
  }

  // Intercept all requests to avoid loading ads
  await newContext.route(
    "**/*",
    async (route: Route, request: PlaywrightRequest) => {
      const requestUrlString = request.url();
      try {
        await assertSafeTargetUrl(requestUrlString);
      } catch (error) {
        if (error instanceof InsecureConnectionError) {
          if (request.isNavigationRequest()) {
            securityState.blockedNavigationRequestUrl = requestUrlString;
          }
          console.warn(`Blocked request: ${requestUrlString}`);
          return route.abort("blockedbyclient");
        }
        throw error;
      }

      const requestUrl = new URL(requestUrlString);
      const hostname = normalizeHostname(requestUrl.hostname);

      if (AD_SERVING_DOMAINS.some((domain) => hostname.includes(domain))) {
        console.log(hostname);
        return route.abort();
      }
      return route.continue();
    },
  );

  return { context: newContext, securityState };
};

const shutdownBrowser = async () => {
  if (browser) {
    await browser.close();
  }
};

async function createLiveBrowserSession(options: {
  live: boolean;
  recording: boolean;
  skipTlsVerification?: boolean;
  userAgentOverride?: string;
  mobile?: boolean;
  location?: UrlModel["location"];
}): Promise<LiveSessionRecord> {
  if (!browser) {
    await initializeBrowser();
  }

  const sessionId = crypto.randomUUID();
  const artifactDir = path.join(serviceArtifactRoot, "browser", sessionId);
  await ensureDir(artifactDir);

  const contextBundle = await createContext(
    options.skipTlsVerification ?? false,
    options.userAgentOverride,
    options.mobile ?? false,
    options.location,
    options.recording ? artifactDir : undefined,
  );
  const page = await contextBundle.context.newPage();
  await page.setContent(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Request processing</title>
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: #111;
        color: #f5f5f5;
        font-family: Arial, sans-serif;
      }
      body {
        display: grid;
        place-items: center;
      }
      .panel {
        padding: 24px 32px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.04);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      }
      .title {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .subtitle {
        margin-top: 8px;
        font-size: 13px;
        opacity: 0.72;
      }
    </style>
  </head>
  <body>
    <div class="panel">
      <div class="title">Request processing</div>
      <div class="subtitle">Waiting for the first browser frame...</div>
    </div>
  </body>
</html>`,
  );
  const session: LiveSessionRecord = {
    sessionId,
    context: contextBundle.context,
    page,
    cdp: undefined as unknown as LiveSessionRecord["cdp"],
    clients: new Set<WebSocket>(),
    latestFrame: null,
    frameCount: 0,
    createdAt: Date.now(),
    artifactDir,
    screenshotPath: null,
    recordingPath: null,
    recordingEnabled: options.recording,
    interactive: options.live,
  };

  if (options.live) {
    await startBrowserScreencast(session);
  }

  browserSessions.set(sessionId, session);
  return session;
}

async function runNodeCode(
  session: LiveSessionRecord,
  code: string,
): Promise<BrowserServiceExecResponse> {
  const logs: string[] = [];
  const captureConsole = (...args: unknown[]) => {
    logs.push(args.map(serializeValue).join(" "));
  };

  try {
    const AsyncFunction = Object.getPrototypeOf(
      async function () {},
    ).constructor;
    const fn = new AsyncFunction(
      "page",
      "context",
      "browser",
      "console",
      "require",
      "process",
      "__dirname",
      "__filename",
      `"use strict"; return (async () => { ${code} })();`,
    );
    const result = await fn(
      session.page,
      session.context,
      browser,
      {
        log: captureConsole,
        info: captureConsole,
        warn: captureConsole,
        error: captureConsole,
      },
      nodeRequire,
      process,
      __dirname,
      __filename,
    );
    return {
      stdout: logs.join("\n"),
      result: serializeValue(result),
      stderr: "",
      exitCode: 0,
      killed: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      stdout: logs.join("\n"),
      result: "",
      stderr: message,
      exitCode: 1,
      killed: false,
    };
  }
}

async function runBashCode(
  session: LiveSessionRecord,
  code: string,
): Promise<BrowserServiceExecResponse> {
  const trimmed = code.trim();
  if (trimmed === "agent-browser get url") {
    return {
      stdout: session.page.url(),
      result: session.page.url(),
      stderr: "",
      exitCode: 0,
      killed: false,
    };
  }

  if (trimmed === "agent-browser snapshot -i") {
    const text = await session.page
      .locator("body")
      .innerText()
      .catch(() => "");
    return {
      stdout: text,
      result: text,
      stderr: "",
      exitCode: 0,
      killed: false,
    };
  }

  return {
    stdout: "",
    result: "",
    stderr: `Unsupported bash command: ${trimmed}`,
    exitCode: 1,
    killed: false,
  };
}

async function executeBrowserSessionCode(
  sessionId: string,
  params: { code: string; language: string; timeout: number },
): Promise<BrowserServiceExecResponse> {
  const session = browserSessions.get(sessionId);
  if (!session) {
    return {
      stdout: "",
      result: "",
      stderr: "Session not found",
      exitCode: 1,
      killed: false,
    };
  }

  if (params.language === "bash") {
    return runBashCode(session, params.code);
  }

  return runNodeCode(session, params.code);
}

async function finalizeBrowserSession(sessionId: string): Promise<
  BrowserServiceDeleteResponse & {
    screenshotUrl?: string;
    recordingUrl?: string;
    framesCaptured?: number;
    recordingDurationMs?: number;
  }
> {
  const session = browserSessions.get(sessionId);
  if (!session) {
    return { ok: true };
  }

  const elapsed = Date.now() - session.createdAt;
  const artifacts = await captureBrowserArtifacts(session);
  const warnings = [...artifacts.warnings];
  let screenshotUrl: string | undefined;
  let recordingUrl: string | undefined;
  let framesCaptured: number | undefined;
  let recordingDurationMs: number | undefined;
  const video = session.page.video();

  try {
    await session.context.close();
  } catch {
    try {
      await session.context.close();
    } catch {}
  }

  screenshotUrl = artifacts.screenshotUrl;
  recordingDurationMs = artifacts.recordingDurationMs;
  if (video) {
    try {
      const videoPath = await video.path();
      const videoDest = browserSessionArtifactPath(sessionId, "recording.webm");
      await rm(videoDest, { force: true }).catch(() => {});
      await copyFile(videoPath, videoDest);
      session.recordingPath = videoDest;
      recordingUrl = apiBrowserArtifactPath(sessionId, "recording.webm");
      recordingDurationMs = elapsed;
    } catch (error) {
      appendLiveWarning(
        warnings,
        "LIVE_RECORDING_FAILED",
        "Recording artifact capture failed.",
        {
          sessionId,
          reason: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
  framesCaptured = session.frameCount;
  browserSessions.delete(sessionId);

  return {
    ok: true,
    sessionDurationMs: elapsed,
    screenshotUrl,
    recordingUrl,
    framesCaptured,
    recordingDurationMs,
  };
}

const isValidUrl = (urlString: string): boolean => {
  try {
    new URL(urlString);
    return true;
  } catch (_) {
    return false;
  }
};

const scrapePage = async (
  page: Page,
  url: string,
  waitUntil: "load" | "networkidle",
  waitAfterLoad: number,
  timeout: number,
  checkSelector: string | undefined,
  securityState: ContextSecurityState,
) => {
  console.log(
    `Navigating to ${url} with waitUntil: ${waitUntil} and timeout: ${timeout}ms`,
  );
  let response;
  try {
    response = await page.goto(url, { waitUntil, timeout });
  } catch (error) {
    if (securityState.blockedNavigationRequestUrl) {
      throw new InsecureConnectionError(
        securityState.blockedNavigationRequestUrl,
        "navigation to private/internal resource is not allowed",
      );
    }
    throw error;
  }

  if (waitAfterLoad > 0) {
    await page.waitForTimeout(waitAfterLoad);
  }

  if (checkSelector) {
    try {
      await page.waitForSelector(checkSelector, { timeout });
    } catch (error) {
      throw new Error("Required selector not found");
    }
  }

  let headers = null,
    content = await page.content();
  let ct: string | undefined = undefined;
  if (response) {
    headers = await response.allHeaders();
    ct = Object.entries(headers).find(
      ([key]) => key.toLowerCase() === "content-type",
    )?.[1];
    if (
      ct &&
      (ct.toLowerCase().includes("application/json") ||
        ct.toLowerCase().includes("text/plain"))
    ) {
      content = (await response.body()).toString("utf8"); // TODO: determine real encoding
    }
  }

  return {
    content,
    status: response ? response.status() : null,
    headers,
    contentType: ct,
  };
};

const executeActions = async (
  page: Page,
  actions: ScrapeAction[],
  timeout: number,
): Promise<ActionResult[]> => {
  const results: ActionResult[] = [];
  const actionStatuses: ActionStatus[] = [];

  for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
    const action = actions[actionIndex];
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    try {
      switch (action.type) {
        case "wait":
          if (action.selector) {
            await page.waitForSelector(action.selector, { timeout });
          } else {
            await page.waitForTimeout(action.milliseconds ?? 0);
          }
          break;
        case "click":
          if (action.all) {
            const matches = await page.locator(action.selector).all();
            for (const match of matches) {
              await match.click({ timeout });
            }
          } else {
            await page.click(action.selector, { timeout });
          }
          break;
        case "screenshot": {
          const originalViewport = page.viewportSize();
          let screenshotBuffer: Buffer;
          try {
            if (action.viewport) {
              await page.setViewportSize(action.viewport);
            }
            screenshotBuffer = await page.screenshot({
              type: "jpeg",
              quality: action.quality ?? 80,
              fullPage: action.fullPage ?? false,
            });
          } finally {
            if (originalViewport && action.viewport) {
              await page.setViewportSize(originalViewport);
            }
          }
          results.push({
            type: "screenshot",
            screenshot: screenshotBuffer.toString("base64"),
          });
          break;
        }
        case "write":
          await page.keyboard.type(action.text);
          break;
        case "press":
          await page.keyboard.press(action.key);
          break;
        case "scroll":
          if (action.selector) {
            await page.locator(action.selector).evaluate((node, direction) => {
              node.scrollBy(
                0,
                direction === "up" ? -window.innerHeight : window.innerHeight,
              );
            }, action.direction ?? "down");
          } else {
            await page.evaluate((direction) => {
              window.scrollBy(
                0,
                direction === "up" ? -window.innerHeight : window.innerHeight,
              );
            }, action.direction ?? "down");
          }
          break;
        case "scrape":
          results.push({ type: "scrape", content: await page.content() });
          break;
        case "executeJavascript":
          const actionTimeout = Math.max(1, timeout - 500);
          results.push({
            type: "executeJavascript",
            value: await Promise.race([
              page.evaluate(action.script),
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error("executeJavascript timed out")),
                  actionTimeout,
                ),
              ),
            ]),
          });
          break;
        default:
          throw new Error(
            `Unsupported action type: ${(action as { type?: string }).type}`,
          );
      }
      actionStatuses.push({
        name: `Action ${actionIndex} (${action.type})`,
        status: "ok",
        durationMs: Date.now() - startedAt,
        startedAt: startedAtIso,
        endedAt: new Date().toISOString(),
      });
    } catch (error) {
      actionStatuses.push({
        name: `Action ${actionIndex} (${action.type})`,
        status: "failed",
        code: "SCRAPE_ACTION_ERROR",
        message: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
        startedAt: startedAtIso,
        endedAt: new Date().toISOString(),
      });
      for (
        let skippedIndex = actionIndex + 1;
        skippedIndex < actions.length;
        skippedIndex++
      ) {
        const skippedAction = actions[skippedIndex];
        actionStatuses.push({
          name: `Action ${skippedIndex} (${skippedAction.type})`,
          status: "skipped",
          startedAt: startedAtIso,
        });
      }
      throw new ScrapeActionError(actionIndex, action, actionStatuses, error);
    }
  }

  return results;
};

app.get(
  "/browsers/:sessionId/view",
  requireBrowserServiceAuth,
  async (req: Request, res: Response) => {
    res
      .status(200)
      .type("html")
      .send(renderBrowserViewHtml(String(req.params.sessionId)));
  },
);

app.get(
  "/browsers/:sessionId/artifacts/:name",
  requireBrowserServiceAuth,
  async (req: Request, res: Response) => {
    const sessionId = String(req.params.sessionId);
    const name = safeArtifactFilename(String(req.params.name));
    if (!name) {
      return res.status(400).json({ error: "Invalid artifact name" });
    }
    const artifactPath = browserSessionArtifactPath(sessionId, name);
    try {
      const file = await readArtifactResponse(artifactPath);
      return res.status(200).type(file.contentType).send(file.body);
    } catch {
      return res.status(404).json({ error: "Artifact not found" });
    }
  },
);

app.post(
  "/browsers",
  requireBrowserServiceAuth,
  async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as BrowserCreateRequest;
    const streamWebView = body.streamWebView !== false;
    const session = await createLiveBrowserSession({
      live: streamWebView,
      recording: streamWebView,
    });

    return res.status(200).json({
      sessionId: session.sessionId,
      cdpUrl: browserLiveWsPath(session.sessionId),
      viewUrl: browserLivePath(session.sessionId),
      iframeUrl: browserLivePath(session.sessionId),
      interactiveIframeUrl: `${browserLivePath(session.sessionId)}?interactive=1`,
      expiresAt: new Date(Date.now() + (body.ttl ?? 600) * 1000).toISOString(),
      live: buildLiveMetadata("browser", session.sessionId, "streaming"),
    } satisfies BrowserServiceCreateResponse);
  },
);

app.post(
  "/browsers/:sessionId/exec",
  requireBrowserServiceAuth,
  async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as BrowserExecRequest;
    if (!body.code || typeof body.code !== "string") {
      return res.status(400).json({
        stdout: "",
        result: "",
        stderr: "Code is required",
        exitCode: 1,
        killed: false,
      } satisfies BrowserServiceExecResponse);
    }

    const execResult = await executeBrowserSessionCode(
      String(req.params.sessionId),
      {
        code: body.code,
        language: body.language ?? "node",
        timeout: body.timeout ?? 30,
      },
    );
    return res.status(execResult.exitCode === 0 ? 200 : 422).json(execResult);
  },
);

app.delete(
  "/browsers/:sessionId",
  requireBrowserServiceAuth,
  async (req: Request, res: Response) => {
    const sessionId = String(req.params.sessionId);
    const deleteResult = await finalizeBrowserSession(sessionId);
    return res.status(200).json({
      ...deleteResult,
      live: buildLiveMetadata("browser", sessionId, "completed", {
        screenshotUrl: deleteResult.screenshotUrl,
        recordingUrl: deleteResult.recordingUrl,
        framesCaptured: deleteResult.framesCaptured,
        recordingDurationMs: deleteResult.recordingDurationMs,
      }),
    });
  },
);

app.get(
  "/scrapes/:scrapeId/artifacts/:name",
  async (req: Request, res: Response) => {
    const scrapeId = String(req.params.scrapeId);
    const name = safeArtifactFilename(String(req.params.name));
    if (!name) {
      return res.status(400).json({ error: "Invalid artifact name" });
    }
    const artifactPath = scrapeSessionArtifactPath(scrapeId, name);
    try {
      const file = await readArtifactResponse(artifactPath);
      return res.status(200).type(file.contentType).send(file.body);
    } catch {
      return res.status(404).json({ error: "Artifact not found" });
    }
  },
);

function safeArtifactFilename(name: string): string | null {
  const base = path.posix.basename(name);
  if (!base || base === "." || base === "..") {
    return null;
  }
  return base;
}

async function readArtifactResponse(
  artifactPath: string,
): Promise<{ body: Buffer; contentType: string }> {
  const body = await readFile(artifactPath);
  const ext = path.extname(artifactPath).toLowerCase();
  const contentType =
    ext === ".jpeg" || ext === ".jpg"
      ? "image/jpeg"
      : ext === ".webm"
        ? "video/webm"
        : ext === ".png"
          ? "image/png"
          : "application/octet-stream";
  return { body, contentType };
}

async function createScrapeArtifacts(
  scrapeId: string,
  page: Page,
  recordingEnabled: boolean,
): Promise<{
  warnings: Array<{
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }>;
  screenshotUrl?: string;
  recordingUrl?: string;
}> {
  const warnings: Array<{
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }> = [];
  const artifactDir = path.join(serviceArtifactRoot, "scrape", scrapeId);
  await ensureDir(artifactDir);

  let screenshotUrl: string | undefined;
  try {
    const screenshotPath = scrapeSessionArtifactPath(scrapeId, "final.jpeg");
    await page.screenshot({ path: screenshotPath, type: "jpeg" });
    const record = scrapeArtifacts.get(scrapeId) ?? { artifactDir };
    record.artifactDir = artifactDir;
    record.screenshotPath = screenshotPath;
    scrapeArtifacts.set(scrapeId, record);
    screenshotUrl = apiScrapeArtifactPath(scrapeId, "final.jpeg");
  } catch (error) {
    appendLiveWarning(
      warnings,
      "LIVE_SCREENSHOT_FAILED",
      "Screenshot capture failed.",
      {
        scrapeId,
        reason: error instanceof Error ? error.message : String(error),
      },
    );
  }

  if (recordingEnabled) {
    try {
      const video = page.video();
      if (video) {
        const videoPath = await video.path();
        const record = scrapeArtifacts.get(scrapeId) ?? { artifactDir };
        const videoDest = scrapeSessionArtifactPath(scrapeId, "recording.webm");
        await rm(videoDest, { force: true }).catch(() => {});
        await copyFile(videoPath, videoDest);
        record.recordingPath = videoDest;
        record.artifactDir = artifactDir;
        scrapeArtifacts.set(scrapeId, record);
        return {
          warnings,
          screenshotUrl,
          recordingUrl: apiScrapeArtifactPath(scrapeId, "recording.webm"),
        };
      }
    } catch (error) {
      appendLiveWarning(
        warnings,
        "LIVE_RECORDING_FAILED",
        "Recording artifact capture failed.",
        {
          scrapeId,
          reason: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  scrapeArtifacts.set(scrapeId, {
    artifactDir,
    screenshotPath: screenshotUrl
      ? scrapeSessionArtifactPath(scrapeId, "final.jpeg")
      : undefined,
  });

  return {
    warnings,
    screenshotUrl,
  };
}

function renderBrowserViewHtml(sessionId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Firecrawl Live View</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0b1020; color: #e5eefc; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    body { display: grid; place-items: center; }
    .shell { width: min(100vw, 1280px); height: min(100vh, 900px); display: grid; grid-template-rows: auto 1fr; gap: 12px; padding: 12px; box-sizing: border-box; }
    .status { padding: 10px 12px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; }
    canvas { width: 100%; height: 100%; background: #11182d; border-radius: 12px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
  </style>
</head>
<body>
  <div class="shell">
    <div class="status" id="status">Request processing...</div>
    <canvas id="canvas"></canvas>
  </div>
  <script>
    const statusEl = document.getElementById('status');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const setStatus = (value) => { statusEl.textContent = value; };
    const fitCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(rect.height * devicePixelRatio));
    };
    const drawPlaceholder = () => {
      fitCanvas();
      ctx.fillStyle = '#11182d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#c7d2fe';
      ctx.font = String(Math.max(18, Math.floor(canvas.width / 40))) + 'px ui-monospace, monospace';
      ctx.fillText('Request processing...', 24, 48);
    };
    let reconnectTimer = null;
    const connect = () => {
      setStatus('Connecting live stream...');
      drawPlaceholder();
      const wsUrl = new URL('./ws', location.href);
      wsUrl.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(wsUrl.toString());
      ws.onopen = () => setStatus('Streaming');
      ws.onmessage = (event) => {
        const payload = JSON.parse(event.data);
        if (payload.type === 'frame' && payload.data) {
          const img = new Image();
          img.onload = () => {
            fitCanvas();
            ctx.fillStyle = '#11182d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const scale = Math.min(
              canvas.width / img.width,
              canvas.height / img.height,
            );
            const drawWidth = Math.max(1, Math.floor(img.width * scale));
            const drawHeight = Math.max(1, Math.floor(img.height * scale));
            const x = Math.floor((canvas.width - drawWidth) / 2);
            const y = Math.floor((canvas.height - drawHeight) / 2);
            ctx.drawImage(img, x, y, drawWidth, drawHeight);
          };
          img.src = 'data:image/jpeg;base64,' + payload.data;
        } else if (payload.type === 'status' && payload.status) {
          setStatus(payload.status === 'streaming' ? 'Streaming' : String(payload.status));
        }
      };
      ws.onerror = () => setStatus('Live stream error');
      ws.onclose = () => {
        setStatus('Live stream closed');
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, 1000);
      };
      window.addEventListener('resize', drawPlaceholder, { once: true });
    };
    drawPlaceholder();
    connect();
  </script>
</body>
</html>`;
}

app.get("/health", async (req: Request, res: Response) => {
  try {
    if (!browser) {
      await initializeBrowser();
    }

    const { context: testContext } = await createContext();
    const testPage = await testContext.newPage();
    await testPage.close();
    await testContext.close();

    res.status(200).json({
      status: "healthy",
      maxConcurrentPages: MAX_CONCURRENT_PAGES,
      activePages: MAX_CONCURRENT_PAGES - pageSemaphore.getAvailablePermits(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error occurred",
    });
  }
});

async function handleScrape(req: Request, res: Response) {
  const {
    url,
    wait_after_load = 0,
    timeout = 15000,
    headers,
    check_selector,
    skip_tls_verification = false,
    screenshot = false,
    full_page_screenshot = false,
    screenshot_quality,
    screenshot_viewport,
    mobile = false,
    location,
    actions = [],
  }: UrlModel = req.body;

  console.log(`================= Scrape Request =================`);
  console.log(`URL: ${url}`);
  console.log(`Wait After Load: ${wait_after_load}`);
  console.log(`Timeout: ${timeout}`);
  console.log(`Headers: ${headers ? JSON.stringify(headers) : "None"}`);
  console.log(`Check Selector: ${check_selector ? check_selector : "None"}`);
  console.log(`Skip TLS Verification: ${skip_tls_verification}`);
  console.log(`Screenshot: ${screenshot}, Full Page: ${full_page_screenshot}`);
  console.log(`Actions: ${actions.length}`);
  console.log(`==================================================`);

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    await assertSafeTargetUrl(url);
  } catch (error) {
    if (error instanceof InsecureConnectionError) {
      return res.json({
        content: "",
        pageStatusCode: 403,
        pageError: error.message,
      });
    }
    throw error;
  }

  if (!PROXY_SERVER) {
    console.warn(
      "⚠️ WARNING: No proxy server provided. Your IP address may be blocked.",
    );
  }

  if (!browser) {
    await initializeBrowser();
  }

  await pageSemaphore.acquire();

  let requestContext: BrowserContext | null = null;
  let securityState: ContextSecurityState | null = null;
  let page: Page | null = null;

  try {
    // Extract user-agent from request headers (case-insensitive) so it can
    // be applied at the context level.  Playwright ignores user-agent in
    // setExtraHTTPHeaders when the context already defines one (#2802).
    const userAgentOverride = headers
      ? Object.entries(headers).find(
          ([k]) => k.toLowerCase() === "user-agent",
        )?.[1]
      : undefined;

    const contextBundle = await createContext(
      skip_tls_verification,
      userAgentOverride,
      mobile,
      location,
      undefined,
      screenshot_viewport,
    );
    requestContext = contextBundle.context;
    securityState = contextBundle.securityState;
    page = await requestContext.newPage();

    if (location) {
      await requestContext.addInitScript((locationData) => {
        const locationState = locationData as {
          country?: string;
          languages?: string[];
        };
        const coordinates = {
          US: { latitude: 37.7749, longitude: -122.4194 },
          CA: { latitude: 43.6532, longitude: -79.3832 },
          DE: { latitude: 52.52, longitude: 13.405 },
          GB: { latitude: 51.5074, longitude: -0.1278 },
          FR: { latitude: 48.8566, longitude: 2.3522 },
          JP: { latitude: 35.6762, longitude: 139.6503 },
        }[locationState.country?.toUpperCase() ?? ""] ?? {
          latitude: 0,
          longitude: 0,
        };

        (
          globalThis as typeof globalThis & {
            __firecrawlLocation?: typeof locationState;
          }
        ).__firecrawlLocation = locationState;

        Object.defineProperty(globalThis.navigator, "geolocation", {
          configurable: true,
          value: {
            getCurrentPosition: (success: Function) =>
              success({
                coords: {
                  accuracy: 1,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  latitude: coordinates.latitude,
                  longitude: coordinates.longitude,
                  speed: null,
                },
                timestamp: Date.now(),
              }),
            watchPosition: (success: Function) => {
              success({
                coords: {
                  accuracy: 1,
                  altitude: null,
                  altitudeAccuracy: null,
                  heading: null,
                  latitude: coordinates.latitude,
                  longitude: coordinates.longitude,
                  speed: null,
                },
                timestamp: Date.now(),
              });
              return 1;
            },
            clearWatch: () => undefined,
          },
        });
      }, location);
    }

    if (headers) {
      // Remove the user-agent key before calling setExtraHTTPHeaders since
      // we already forwarded it to the context-level userAgent option.
      const filteredHeaders = Object.fromEntries(
        Object.entries(headers).filter(
          ([k]) => k.toLowerCase() !== "user-agent",
        ),
      );
      if (Object.keys(filteredHeaders).length > 0) {
        await page.setExtraHTTPHeaders(filteredHeaders);
      }
    }

    const result = await scrapePage(
      page,
      url,
      "load",
      wait_after_load,
      timeout,
      check_selector,
      securityState,
    );

    const actionResults = await executeActions(page, actions, timeout);
    result.content = await page.content();

    const pageError =
      result.status !== 200 ? getError(result.status) : undefined;

    let screenshotData: string | undefined;
    if (screenshot || full_page_screenshot) {
      const screenshotBuffer = await page.screenshot({
        type: "jpeg",
        quality: screenshot_quality ?? 80,
        fullPage: full_page_screenshot,
      });
      screenshotData = screenshotBuffer.toString("base64");
    }

    if (!pageError) {
      console.log(`✅ Scrape successful!`);
    } else {
      console.log(
        `🚨 Scrape failed with status code: ${result.status} ${pageError}`,
      );
    }

    const responseBody = {
      content: result.content,
      pageStatusCode: result.status,
      contentType: result.contentType,
      ...(pageError && { pageError }),
      ...(screenshotData !== undefined && { screenshot: screenshotData }),
      ...(actionResults.length > 0 && { actionResults }),
    };

    return res.json(responseBody);
  } catch (error) {
    if (error instanceof InsecureConnectionError) {
      return res.json({
        content: "",
        pageStatusCode: 403,
        pageError: error.message,
      });
    }
    if (error instanceof ScrapeActionError) {
      let failurePageUrl: string | undefined;
      let failureScreenshot: string | undefined;
      if (page) {
        try {
          failurePageUrl = page.url();
        } catch {}
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 70 });
          failureScreenshot = buf.toString("base64");
        } catch {}
      }
      return res.status(422).json({
        content: "",
        pageStatusCode: 422,
        error: "Action failed",
        actionError: {
          actionIndex: error.actionIndex,
          type: error.action.type,
          actionType: error.action.type,
          selector:
            "selector" in error.action ? error.action.selector : undefined,
          message: error.message,
          ...(error.actionStatuses !== undefined
            ? { actionStatuses: error.actionStatuses }
            : {}),
          ...(failurePageUrl !== undefined ? { pageUrl: failurePageUrl } : {}),
          ...(failureScreenshot !== undefined
            ? { screenshot: failureScreenshot }
            : {}),
        },
      });
    }
    console.error("Scrape error:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching the page." });
  } finally {
    if (page) await page.close();
    if (requestContext) await requestContext.close();
    pageSemaphore.release();
  }
}

app.post("/scrape", handleScrape);
app.post("/scrape-cdp", handleScrape);

const server = http.createServer(app);
const browserLiveWsServer = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  try {
    const requestUrl = new URL(req.url ?? "", "http://localhost");
    const match = requestUrl.pathname.match(/^\/browsers\/([^/]+)\/view\/ws$/);
    if (!match) {
      socket.destroy();
      return;
    }

    const sessionId = decodeURIComponent(match[1]);
    browserLiveWsServer.handleUpgrade(req, socket, head, (ws: any) => {
      const session = browserSessions.get(sessionId);
      if (!session) {
        ws.close();
        return;
      }
      attachBrowserSessionClient(session, ws);
    });
  } catch {
    socket.destroy();
  }
});

server.listen(port, () => {
  initializeBrowser().then(() => {
    console.log(`Server is running on port ${port}`);
  });
});

if (require.main === module) {
  process.on("SIGINT", () => {
    shutdownBrowser().then(() => {
      console.log("Browser closed");
      process.exit(0);
    });
  });
}
