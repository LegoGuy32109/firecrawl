import { describe, expect, it } from "vitest";
import { extractInteractResponseContext } from "./interact-response";

describe("extractInteractResponseContext", () => {
  it("reads top-level live view fields", () => {
    expect(
      extractInteractResponseContext({
        sessionId: "123e4567-e89b-12d3-a456-426614174000",
        liveViewUrl: "./session/abc/view",
      }),
    ).toEqual({
      sessionId: "123e4567-e89b-12d3-a456-426614174000",
      liveViewUrl: "./session/abc/view",
    });
  });

  it("falls back to details.liveViewUrl when present", () => {
    expect(
      extractInteractResponseContext({
        details: {
          sessionId: "123e4567-e89b-12d3-a456-426614174001",
          liveViewUrl: "./session/xyz/view",
        },
      }),
    ).toEqual({
      sessionId: "123e4567-e89b-12d3-a456-426614174001",
      liveViewUrl: "./session/xyz/view",
    });
  });

  it("returns nulls when values are missing", () => {
    expect(extractInteractResponseContext({})).toEqual({
      sessionId: null,
      liveViewUrl: null,
    });
  });
});
