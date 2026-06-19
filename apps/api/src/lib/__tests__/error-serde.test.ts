import { describe, expect, it } from "vitest";
import {
  deserializeTransportableError,
  serializeTransportableError,
} from "../error-serde";
import { DNSResolutionError } from "../../scraper/scrapeURL/error";
import { ScrapeError } from "../error-codes";

describe("transportable error serde", () => {
  it("preserves code and details", () => {
    const original = new DNSResolutionError("example.invalid");
    const serialized = serializeTransportableError(original);
    const roundTrip = deserializeTransportableError(serialized);

    expect(roundTrip?.code).toBe(ScrapeError.DNS);
    expect(roundTrip?.details).toEqual({ hostname: "example.invalid" });
  });
});
