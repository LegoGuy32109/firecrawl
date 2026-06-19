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
  return `data:${mime};base64,${trimmed}`;
}
