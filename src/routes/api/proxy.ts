import { config } from "../../config.ts";

function jsonError(message: string, status: number): Response {
  return Response.json({ success: false, error: message }, { status });
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function handleCrawl4aiProxySubmit(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const targetUrl = joinUrl(config.CRAWL4AI_URL, "crawl/job");
  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return jsonError("Crawl4AI backend unavailable", 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "Upstream Crawl4AI error");
    return jsonError(text, res.status);
  }

  return new Response(res.body, { status: res.status, headers: res.headers });
}

export async function handleCrawl4aiProxyPoll(_req: Request, id: string): Promise<Response> {
  const targetUrl = joinUrl(config.CRAWL4AI_URL, `crawl/job/${id}`);
  let res: Response;
  try {
    res = await fetch(targetUrl);
  } catch {
    return jsonError("Crawl4AI backend unavailable", 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "Upstream Crawl4AI error");
    return jsonError(text, res.status);
  }

  return new Response(res.body, { status: res.status, headers: res.headers });
}

export async function handleSearxngProxy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = new URL(joinUrl(config.SEARXNG_URL, "search"));
  for (const [key, value] of url.searchParams) {
    targetUrl.searchParams.set(key, value);
  }

  let res: Response;
  try {
    res = await fetch(targetUrl.toString());
  } catch {
    return jsonError("SearXNG backend unavailable", 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "Upstream SearXNG error");
    return jsonError(text, res.status);
  }

  return new Response(res.body, { status: res.status, headers: res.headers });
}
