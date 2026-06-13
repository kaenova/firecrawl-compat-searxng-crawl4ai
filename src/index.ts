import { config } from "./config.ts";
import { healthHandler } from "./routes/health.ts";
import { handleSearch } from "./routes/search.ts";
import { handleScrape } from "./routes/scrape.ts";
import { logFailure, logRequest } from "./logger.ts";

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

  try {
    const authError = checkAuth(req);
    if (authError) {
      logRequest({ method, path, status: authError.status, durationMs: Date.now() - startedAt, requestId });
      return authError;
    }

    let response: Response;

    if (req.method === "GET" && path === "/v2/health") {
      response = healthHandler(req);
    } else if (req.method === "POST" && path === "/v2/search") {
      response = await handleSearch(req);
    } else if (req.method === "POST" && path === "/v2/scrape") {
      response = await handleScrape(req);
    } else {
      response = jsonResponse({ success: false, error: "Not found" }, 404);
    }

    logRequest({ method, path, status: response.status, durationMs: Date.now() - startedAt, requestId });
    return response;
  } catch (error) {
    logFailure({ method, path, status: 500, durationMs: Date.now() - startedAt, requestId, error });
    return jsonResponse({ success: false, error: "Internal server error" }, 500);
  }
}

/* ------------------------------------------------------------------
   Server (only starts when this file is the main module)
   ------------------------------------------------------------------ */

let server: ReturnType<typeof Bun.serve> | undefined;

if (import.meta.main) {
  console.log(`[DEBUG] Proxy starting with CRAWL4AI_URL=${process.env.CRAWL4AI_URL}`);
  server = Bun.serve({
    port: config.PORT,
    fetch: appFetch,
  });
  console.log(`Server listening on http://localhost:${server.port}`);
}

export { server };
