import { describe, expect, it } from "vitest";
import {
  buildReplayContextFromScrape,
  parseReplayFailure,
} from "./scrape-replay";

describe("scrape replay helpers", () => {
  it("preserves replay options that can be applied during browser setup", () => {
    const result = buildReplayContextFromScrape({
      id: "scrape-id",
      team_id: "team-id",
      url: "https://example.com/path",
      options: {
        waitFor: 1500,
        actions: [{ type: "click", selector: "#go" }],
        headers: { "x-test": "value" },
        mobile: true,
        location: { country: "US", languages: ["en-US"] },
        skipTlsVerification: true,
      },
    });

    expect(result.context).toEqual(
      expect.objectContaining({
        targetUrl: "https://example.com/path",
        waitForMs: 1500,
        actions: [{ type: "click", selector: "#go", all: false }],
        headers: { "x-test": "value" },
        mobile: true,
        location: { country: "US", languages: ["en-US"] },
        skipTlsVerification: true,
      }),
    );
  });

  it("only parses structured replay failures", () => {
    expect(
      parseReplayFailure(
        "Replay action #3 (click): synthetic test of replay parser",
      ),
    ).toBeUndefined();

    expect(
      parseReplayFailure(
        'Replay action #3 (click): boom __FIRECRAWL_REPLAY_FAILURE__:{"actionIndex":2,"actionNumber":3,"actionType":"click"}',
      ),
    ).toEqual({
      actionIndex: 2,
      actionNumber: 3,
      actionType: "click",
    });
  });
});
