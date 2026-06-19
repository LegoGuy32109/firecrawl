import { describe, expect, it } from "vitest";
import {
  buildInteractRequestBody,
  getInteractRequestValidationError,
} from "./interact-request";

describe("interact-request helpers", () => {
  it("rejects empty job ids and missing execution payloads", () => {
    expect(
      getInteractRequestValidationError(
        { jobId: " ", code: " ", prompt: "" },
        false,
        "{}",
      ),
    ).toBe("Job ID is required.");

    expect(
      getInteractRequestValidationError(
        { jobId: "abc", code: " ", prompt: " " },
        false,
        "{}",
      ),
    ).toBe("Provide either code or a prompt.");
  });

  it("builds a normalized interact body when form fields are present", () => {
    expect(
      buildInteractRequestBody(
        {
          jobId: " 123 ",
          code: "console.log(1)",
          language: "node",
          timeout: 12,
        },
        false,
        "{}",
      ),
    ).toEqual({
      jobId: "123",
      code: "console.log(1)",
      language: "node",
      timeout: 12,
      sessionMode: "reuse",
    });
  });
});
