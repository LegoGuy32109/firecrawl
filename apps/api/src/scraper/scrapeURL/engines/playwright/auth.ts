import { config } from "../../../../config";

export function getPlaywrightServiceHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(config.BROWSER_SERVICE_API_KEY
      ? { Authorization: `Bearer ${config.BROWSER_SERVICE_API_KEY}` }
      : {}),
  };
}
