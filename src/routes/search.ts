import { searchSearxng, type SearchRequest, type SearchResponse, type ErrorResponse } from "../adapters/searxng.ts";

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

  const result = await searchSearxng(searchReq);

  if (!result.success) {
    return jsonResponse(result as ErrorResponse, 502);
  }

  return jsonResponse(result as SearchResponse, 200);
}

function jsonResponse(data: object, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
