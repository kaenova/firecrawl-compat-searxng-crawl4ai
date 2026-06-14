import { config } from "./config.ts";
import { healthHandler } from "./routes/health.ts";
import { handleSearch } from "./routes/search.ts";
import { handleScrape } from "./routes/scrape.ts";
import { handleMetrics } from "./routes/api/metrics.ts";
import { handleActivity } from "./routes/api/activity.ts";
import {
  handleCrawl4aiProxySubmit,
  handleCrawl4aiProxyPoll,
  handleSearxngProxy,
} from "./routes/api/proxy.ts";
import { logFailure, logRequest } from "./logger.ts";
import { initActivityStore } from "./stores/sqlite-activity-store.ts";

/* ------------------------------------------------------------------
   HTTP helpers
   ------------------------------------------------------------------ */

function jsonResponse(body: unknown, status: number = 200): Response {
  return Response.json(body, { status });
}

async function parseJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

function getRequestContext(req: Request): { method: string; path: string; requestId?: string } {
  const url = new URL(req.url);
  return {
    method: req.method,
    path: url.pathname,
    requestId: req.headers.get("x-request-id") ?? undefined,
  };
}

/* ------------------------------------------------------------------
   Auth
   ------------------------------------------------------------------ */

function checkAuth(req: Request): Response | null {
  if (!config.FIRECRAWL_API_KEY) return null;

  const authHeader = req.headers.get("Authorization");
  const expected = `Bearer ${config.FIRECRAWL_API_KEY}`;

  if (!authHeader || authHeader !== expected) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  return null;
}

/* ------------------------------------------------------------------
   App fetch handler (exported for testing)
   ------------------------------------------------------------------ */

export async function appFetch(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const { method, path, requestId } = getRequestContext(req);
  const reqClone = req.clone();

  try {
    const authError = checkAuth(req);
    if (authError) {
      const reqBody = await reqClone.text().catch(() => undefined);
      logRequest({ method, path, status: authError.status, durationMs: Date.now() - startedAt, requestId, requestBody: reqBody });
      return authError;
    }

    let response: Response;

    if (req.method === "GET" && path === "/v2/health") {
      response = healthHandler(req);
    } else if (req.method === "POST" && path === "/v2/search") {
      response = await handleSearch(req);
    } else if (req.method === "POST" && path === "/v2/scrape") {
      response = await handleScrape(req);
    } else if (req.method === "GET" && path === "/api/metrics") {
      response = await handleMetrics(req);
    } else if (req.method === "GET" && path === "/api/activity") {
      response = await handleActivity(req);
    } else if (req.method === "POST" && path === "/api/proxy/crawl4ai/crawl/job") {
      response = await handleCrawl4aiProxySubmit(req);
    } else if (req.method === "GET" && path.startsWith("/api/proxy/crawl4ai/crawl/job/")) {
      const id = path.slice("/api/proxy/crawl4ai/crawl/job/".length);
      response = await handleCrawl4aiProxyPoll(req, id);
    } else if (req.method === "GET" && path === "/api/proxy/searxng/search") {
      response = await handleSearxngProxy(req);
    } else {
      response = jsonResponse({ success: false, error: "Not found" }, 404);
    }

    const [reqBody, resBody] = await Promise.all([
      reqClone.text().catch(() => undefined),
      response.clone().text().catch(() => undefined),
    ]);
    logRequest({ method, path, status: response.status, durationMs: Date.now() - startedAt, requestId, requestBody: reqBody, responseBody: resBody });
    return response;
  } catch (error) {
    const reqBody = await reqClone.text().catch(() => undefined);
    logFailure({ method, path, status: 500, durationMs: Date.now() - startedAt, requestId, error, requestBody: reqBody });
    return jsonResponse({ success: false, error: "Internal server error" }, 500);
  }
}

/* ------------------------------------------------------------------
   MIME types for static files
   ------------------------------------------------------------------ */

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
};

function getContentType(path: string): string {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/* ------------------------------------------------------------------
   Server (only starts when this file is the main module)
   ------------------------------------------------------------------ */

let server: ReturnType<typeof Bun.serve> | undefined;

if (import.meta.main) {
  initActivityStore(config.ACTIVITY_DB_PATH);

  server = Bun.serve({
    port: config.PORT,
    fetch: async (req) => {
      const url = new URL(req.url);
      const path = url.pathname;
      // API routes go through appFetch
      if (path.startsWith("/v2/") || path.startsWith("/api/")) {
        return appFetch(req);
      }
      // Static files
      const filePath = path === "/" ? "client/dist/index.html" : `client/dist${path}`;
      const file = Bun.file(filePath);
      if (await file.exists()) {
        return new Response(file, { headers: { "Content-Type": getContentType(filePath) } });
      }
      // SPA fallback
      return new Response(Bun.file("client/dist/index.html"), {
        headers: { "Content-Type": "text/html" },
      });
    },
  });
  console.log(`Server listening on http://localhost:${server.port}`);
}

export { server };
