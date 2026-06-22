import { describe, expect, it } from "vitest";
import { toImageSrc } from "./imageSrc";

describe("toImageSrc", () => {
  it("wraps raw JPEG base64 screenshots as data URLs", () => {
    expect(toImageSrc("/9j/4AAQSkZJRgABAQAAAQABAAD")).toBe(
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
    );
  });

  it("preserves root-relative screenshot URLs", () => {
    expect(toImageSrc("/storage/v1/object/public/media/screenshot.jpg")).toBe(
      "/storage/v1/object/public/media/screenshot.jpg",
    );
  });

  it("wraps raw PNG base64 screenshots as data URLs", () => {
    expect(toImageSrc("iVBORw0KGgoAAAANSUhEUgAAAAE")).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE",
    );
  });
});
