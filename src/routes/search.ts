import { searchSearxng, type SearchRequest, type SearchResponse, type ErrorResponse } from "../adapters/searxng.ts";
import { searchWhoogle } from "../adapters/whoogle.ts";
import { config } from "../config.ts";

const BACKENDS: Record<string, (req: SearchRequest) => Promise<SearchResponse | ErrorResponse>> = {
  whoogle: searchWhoogle,
  searxng: searchSearxng,
};

function getPriorityList(): string[] {
  return config.SEARCH_PRIORITY
    .split(",")
    .map((b) => b.trim().toLowerCase())
    .filter((b) => b.length > 0);
}

export async function handleSearch(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const searchReq = body as SearchRequest;
  if (!searchReq.query || typeof searchReq.query !== "string") {
    return jsonResponse({ success: false, error: "query is required" }, 400);
  }

  const priorities = getPriorityList();
  let lastError: ErrorResponse | null = null;

  for (const name of priorities) {
    const backend = BACKENDS[name];
    if (!backend) {
      console.warn(`Unknown search backend in SEARCH_PRIORITY: ${name}`);
      continue;
    }

    const result = await backend(searchReq);

    if (result.success) {
      return jsonResponse(result as SearchResponse, 200);
    }

    lastError = result as ErrorResponse;
    console.warn(`Search backend ${name} failed: ${lastError.error}`);
  }

  if (lastError) {
    return jsonResponse(lastError, 502);
  }

  return jsonResponse({ success: false, error: "No search backends configured" }, 502);
}

function jsonResponse(data: object, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
