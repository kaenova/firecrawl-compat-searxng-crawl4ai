import { config } from "./config.ts";
import { healthHandler } from "./routes/health.ts";
import { handleSearch } from "./routes/search.ts";
import { handleScrape } from "./routes/scrape.ts";

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
   Server
   ------------------------------------------------------------------ */

const server = Bun.serve({
  port: config.PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Optional Bearer-token auth
    const authError = checkAuth(req);
    if (authError) return authError;

    // --- GET /v2/health -------------------------------------------------
    if (req.method === "GET" && pathname === "/v2/health") {
      return healthHandler(req);
    }

    // --- POST /v2/search ------------------------------------------------
    if (req.method === "POST" && pathname === "/v2/search") {
      return handleSearch(req);
    }

    // --- POST /v2/scrape ------------------------------------------------
    if (req.method === "POST" && pathname === "/v2/scrape") {
      return handleScrape(req);
    }

    // --- catch-all ------------------------------------------------------
    return jsonResponse({ success: false, error: "Not found" }, 404);
  },
});

export default server;

console.log(`Server listening on http://localhost:${server.port}`);
