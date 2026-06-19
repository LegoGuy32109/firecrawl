import request from "supertest";
import { TEST_API_URL } from "../../__tests__/snips/lib";
import { config } from "../../config";

describe("playground route", () => {
  it("GET /admin/{key}/playground returns 200 with inline bundle and styles", async () => {
    const res = await request(TEST_API_URL)
      .get(`/admin/${config.BULL_AUTH_KEY}/playground`)
      .expect(200);
    expect(res.text).toContain("<script>");
    expect(res.text).toContain("<style>");
    expect(res.text).toContain("playground-panel");
    expect(res.text.length).toBeGreaterThan(100);
  });

  it("GET /admin/wrong-key/playground returns 404", async () => {
    await request(TEST_API_URL).get("/admin/wrong-key/playground").expect(404);
  });
});
