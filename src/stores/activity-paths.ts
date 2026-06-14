/**
 * Central allowlist for request activity persistence.
 * Only high-priority paths are saved to SQLite.
 */

export const HIGH_PRIORITY_PATHS = [
  "POST /v2/search",
  "POST /v2/scrape",
];

/**
 * Check if a request path should be persisted to the activity database.
 * Only exact /v2/* paths are persisted.
 */
export function isHighPriorityPath(method: string, path: string): boolean {
  const exact = `${method} ${path}`;
  return HIGH_PRIORITY_PATHS.includes(exact);
}
