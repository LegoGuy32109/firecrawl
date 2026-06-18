export function adminBrowserLiveViewPath(
  basePath: string,
  sessionId: string,
): string {
  return `${basePath}/session/${encodeURIComponent(sessionId)}/view`;
}

export function adminBrowserLiveArtifactPath(
  basePath: string,
  sessionId: string,
  name: string,
): string {
  return `${basePath}/session/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(name)}`;
}
