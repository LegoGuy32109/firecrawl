import request from "supertest";
import { TEST_API_URL } from "../lib";

describe("__playgroundLive is not accepted by public /v2/scrape", () => {
  it("POST /v2/scrape with __playgroundLive:true returns 400 (unknown field)", async () => {
    const res = await request(TEST_API_URL)
      .post("/v2/scrape")
      .set("Authorization", "Bearer test")
      .send({ url: "https://example.com", __playgroundLive: true })
      .expect(400);
    // Strict schema should reject the unknown field
    expect(res.body.success).toBe(false);
  });
});
