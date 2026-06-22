export function toImageSrc(value: string): string {
  const trimmed = value.trim();

  if (
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }

  const mime = trimmed.startsWith("iVBOR") ? "image/png" : "image/jpeg";

  if (trimmed.startsWith("/9j/") || trimmed.startsWith("iVBOR")) {
    return `data:${mime};base64,${trimmed}`;
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  return `data:${mime};base64,${trimmed}`;
}
