/* ------------------------------------------------------------------
   Environment configuration with defaults
   ------------------------------------------------------------------ */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getNumberEnv(name: string, fallback: string): number {
  return Number(process.env[name] ?? fallback);
}

function getStringEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

export const config = {
  SEARXNG_URL: requireEnv("SEARXNG_URL"),
  CRAWL4AI_URL: requireEnv("CRAWL4AI_URL"),
  PORT: getNumberEnv("PORT", "3002"),
  SCRAPE_TIMEOUT: getNumberEnv("SCRAPE_TIMEOUT", "60"),
  POLL_INTERVAL: getNumberEnv("POLL_INTERVAL", "1000"),
  FIRECRAWL_API_KEY: process.env["FIRECRAWL_API_KEY"] ?? undefined,
  ACTIVITY_DB_PATH: process.env["ACTIVITY_DB_PATH"] ?? "activity.db",
  WHOOGLE_ENDPOINT: getStringEnv("WHOOGLE_ENDPOINT"),
  SEARCH_PRIORITY: getStringEnv("SEARCH_PRIORITY", "whoogle,searxng") ?? "whoogle,searxng",
} as const;
