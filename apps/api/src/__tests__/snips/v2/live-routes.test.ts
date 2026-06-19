import request from "supertest";
import { TEST_API_URL } from "../lib";

describe("public /v2/live/* routes do not exist", () => {
  it("GET /v2/live/browser/:id/view returns 404", async () => {
    await request(TEST_API_URL)
      .get("/v2/live/browser/test-session-id/view")
      .expect(404);
  });

  it("GET /v2/live/browser/:id/artifacts/:name returns 404", async () => {
    await request(TEST_API_URL)
      .get("/v2/live/browser/test-session-id/artifacts/final.jpeg")
      .expect(404);
  });

  it("GET /v2/live/scrape/:id/artifacts/:name returns 404", async () => {
    await request(TEST_API_URL)
      .get("/v2/live/scrape/test-scrape-id/artifacts/final.jpeg")
      .expect(404);
  });
});
