import { searchSearxng, type SearchRequest, type SearchResponse, type ErrorResponse } from "../adapters/searxng.ts";
import { logFailure, logRequest } from "../logger.ts";

export async function handleSearch(req: Request): Promise<Response> {
  const startedAt = Date.now();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const response = jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    logRequest({ method: req.method, path: new URL(req.url).pathname, status: response.status, durationMs: Date.now() - startedAt });
    return response;
  }

  const searchReq = body as SearchRequest;
  if (!searchReq.query || typeof searchReq.query !== "string") {
    const response = jsonResponse({ success: false, error: "query is required" }, 400);
    logRequest({ method: req.method, path: new URL(req.url).pathname, status: response.status, durationMs: Date.now() - startedAt });
    return response;
  }

  const result = await searchSearxng(searchReq);

  if (!result.success) {
    const response = jsonResponse(result as ErrorResponse, 502);
    logFailure({ method: req.method, path: new URL(req.url).pathname, status: response.status, durationMs: Date.now() - startedAt, error: result });
    return response;
  }

  const response = jsonResponse(result as SearchResponse, 200);
  logRequest({ method: req.method, path: new URL(req.url).pathname, status: response.status, durationMs: Date.now() - startedAt });
  return response;
}

function jsonResponse(data: object, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
