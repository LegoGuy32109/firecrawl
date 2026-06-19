import request from "supertest";
import { config } from "../../config";
import { TEST_API_URL, HAS_PLAYWRIGHT, itIf } from "../../__tests__/snips/lib";

describe("playground session routes", () => {
  itIf(HAS_PLAYWRIGHT)(
    "POST session creates a session",
    async () => {
      const res = await request(TEST_API_URL)
        .post(`/admin/${config.BULL_AUTH_KEY}/playground/session`)
        .expect(200);

      expect(res.body.sessionId).toBeDefined();
      expect(typeof res.body.sessionId).toBe("string");
      expect(res.body.viewUrl).toBeDefined();

      await request(TEST_API_URL).delete(
        `/admin/${config.BULL_AUTH_KEY}/playground/session/${res.body.sessionId}`,
      );
    },
    30000,
  );

  itIf(HAS_PLAYWRIGHT)(
    "DELETE session returns duration",
    async () => {
      const createRes = await request(TEST_API_URL)
        .post(`/admin/${config.BULL_AUTH_KEY}/playground/session`)
        .expect(200);

      const deleteRes = await request(TEST_API_URL)
        .delete(
          `/admin/${config.BULL_AUTH_KEY}/playground/session/${createRes.body.sessionId}`,
        )
        .expect(200);

      expect(deleteRes.body.ok).toBe(true);
    },
    30000,
  );

  it("DELETE unknown session id returns 404", async () => {
    await request(TEST_API_URL)
      .delete(
        `/admin/${config.BULL_AUTH_KEY}/playground/session/nonexistent-id-that-does-not-exist`,
      )
      .expect(404);
  });
});
