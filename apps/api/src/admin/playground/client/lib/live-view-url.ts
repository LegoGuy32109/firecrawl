export function resolvePlaygroundLiveViewUrl(
  url: string,
  opts: { origin?: string; pathname?: string } = {},
): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;

  const origin =
    opts.origin ??
    (typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost");
  const pathname =
    opts.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  const basePath = `${origin}${pathname.replace(/\/?$/, "")}/`;

  return new URL(url, basePath).toString();
}
