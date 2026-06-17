export function browserLiveViewPath(sessionId: string): string {
  return `/v2/live/browser/${encodeURIComponent(sessionId)}/view`;
}

export function browserLiveWsPath(sessionId: string): string {
  return `/v2/live/browser/${encodeURIComponent(sessionId)}/ws`;
}

export function browserLiveArtifactPath(
  sessionId: string,
  name: string,
): string {
  return `/v2/live/browser/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(name)}`;
}

export function scrapeLiveArtifactPath(scrapeId: string, name: string): string {
  return `/v2/live/scrape/${encodeURIComponent(scrapeId)}/artifacts/${encodeURIComponent(name)}`;
}
