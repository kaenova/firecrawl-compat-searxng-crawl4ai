/**
 * Central allowlist for request activity persistence.
 * Only high-priority paths are saved to SQLite.
 */

export const HIGH_PRIORITY_PATHS = [
  "POST /v2/search",
  "POST /v2/scrape",
  "GET /api/proxy/searxng/search",
  "POST /api/proxy/crawl4ai/crawl/job",
];

/**
 * Check if a request path should be persisted to the activity database.
 * Handles exact matches and dynamic paths (e.g. poll job by ID).
 */
export function isHighPriorityPath(method: string, path: string): boolean {
  const exact = `${method} ${path}`;
  if (HIGH_PRIORITY_PATHS.includes(exact)) return true;

  // Dynamic poll path: GET /api/proxy/crawl4ai/crawl/job/:id
  if (
    method === "GET" &&
    /^\/api\/proxy\/crawl4ai\/crawl\/job\/[^\/]+$/.test(path)
  ) {
    return true;
  }

  return false;
}
