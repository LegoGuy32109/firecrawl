import { describe, expect, it } from "vitest";
import { extractReturnedSessionId } from "./RequestBuilder";

describe("extractReturnedSessionId", () => {
  it("reads a top-level sessionId", () => {
    expect(
      extractReturnedSessionId({
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
      }),
    ).toBe("123e4567-e89b-12d3-a456-426614174000");
  });

  it("falls back to details.sessionId", () => {
    expect(
      extractReturnedSessionId({
        details: {
          sessionId: "123e4567-e89b-12d3-a456-426614174001",
        },
      }),
    ).toBe("123e4567-e89b-12d3-a456-426614174001");
  });

  it("returns null when no session id is present", () => {
    expect(extractReturnedSessionId({})).toBeNull();
    expect(extractReturnedSessionId({ details: { sessionId: 42 } })).toBeNull();
  });
});
