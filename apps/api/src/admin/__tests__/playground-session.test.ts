import request from "supertest";
import express from "express";
import { config } from "../../config";
import { HAS_PLAYWRIGHT, itIf } from "../../__tests__/snips/lib";
import { adminRouter } from "../../routes/admin";

const app = express();
app.use(adminRouter);

describe("playground session routes", () => {
  itIf(HAS_PLAYWRIGHT)(
    "POST session creates a session",
    async () => {
      const res = await request(app)
        .post(`/admin/${config.BULL_AUTH_KEY}/playground/session`)
        .expect(200);

      expect(res.body.sessionId).toBeDefined();
      expect(typeof res.body.sessionId).toBe("string");
      expect(res.body.viewUrl).toBeDefined();

      await request(app).delete(
        `/admin/${config.BULL_AUTH_KEY}/playground/session/${res.body.sessionId}`,
      );
    },
    30000,
  );

  itIf(HAS_PLAYWRIGHT)(
    "DELETE session returns duration",
    async () => {
      const createRes = await request(app)
        .post(`/admin/${config.BULL_AUTH_KEY}/playground/session`)
        .expect(200);

      const deleteRes = await request(app)
        .delete(
          `/admin/${config.BULL_AUTH_KEY}/playground/session/${createRes.body.sessionId}`,
        )
        .expect(200);

      expect(deleteRes.body.ok).toBe(true);
    },
    30000,
  );

  itIf(HAS_PLAYWRIGHT)("DELETE unknown session id returns 404", async () => {
    await request(app)
      .delete(
        `/admin/${config.BULL_AUTH_KEY}/playground/session/nonexistent-id-that-does-not-exist`,
      )
      .expect(404);
  });

  it("POST session without the BULL_AUTH_KEY path returns 404", async () => {
    await request(app).post("/admin/playground/session").expect(404);
  });
});
