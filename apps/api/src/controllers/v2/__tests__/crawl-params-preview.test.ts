import { describe, expect, it, vi, beforeEach } from "vitest";
import { RequestError } from "../../../lib/error-codes";

vi.mock("../../../lib/map-utils", () => ({
  buildPromptWithWebsiteStructure: vi.fn(),
}));

vi.mock("../../../scraper/scrapeURL/transformers/llmExtract", () => ({
  generateCrawlerOptionsFromPrompt: vi.fn(),
}));

import { crawlParamsPreviewController } from "../crawl-params-preview";
import { buildPromptWithWebsiteStructure } from "../../../lib/map-utils";
import { generateCrawlerOptionsFromPrompt } from "../../../scraper/scrapeURL/transformers/llmExtract";

const buildPromptWithWebsiteStructureMock = vi.mocked(
  buildPromptWithWebsiteStructure,
);
const generateCrawlerOptionsFromPromptMock = vi.mocked(
  generateCrawlerOptionsFromPrompt,
);

function buildRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
}

describe("crawl params preview controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns enriched crawl params with the v2 envelope", async () => {
    buildPromptWithWebsiteStructureMock.mockResolvedValueOnce({
      prompt: "expanded prompt",
      websiteUrls: ["https://example.com"],
    } as any);
    generateCrawlerOptionsFromPromptMock.mockResolvedValueOnce({
      extract: {
        maxDepth: 3,
        crawlEntireDomain: true,
      },
    } as any);

    const req = {
      auth: { team_id: "team-1" },
      acuc: { flags: null },
      body: {
        url: "https://example.com",
        prompt: "Summarize the site",
      },
    } as any;
    const res = buildRes();

    await crawlParamsPreviewController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        status: "ok",
        data: expect.objectContaining({
          url: "https://example.com",
          maxDepth: 3,
          crawlEntireDomain: true,
        }),
      }),
    );
  });

  it("returns a structured bad request for invalid params", async () => {
    const req = {
      auth: { team_id: "team-1" },
      acuc: { flags: null },
      body: {
        url: "not-a-url",
        prompt: "Summarize the site",
      },
    } as any;
    const res = buildRes();

    await crawlParamsPreviewController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: "failed",
        code: RequestError.BAD_REQUEST,
        error: expect.stringContaining("Invalid request parameters"),
      }),
    );
  });

  it("returns a structured bad request when prompt generation fails", async () => {
    buildPromptWithWebsiteStructureMock.mockResolvedValueOnce({
      prompt: "expanded prompt",
      websiteUrls: ["https://example.com"],
    } as any);
    generateCrawlerOptionsFromPromptMock.mockRejectedValueOnce(
      new Error("prompt parse failed"),
    );

    const req = {
      auth: { team_id: "team-1" },
      acuc: { flags: null },
      body: {
        url: "https://example.com",
        prompt: "Summarize the site",
      },
    } as any;
    const res = buildRes();

    await crawlParamsPreviewController(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: "failed",
        code: RequestError.BAD_REQUEST,
        error: expect.stringContaining(
          "Failed to process natural language prompt",
        ),
      }),
    );
  });
});
