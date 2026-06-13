import { config } from "../../config.ts";

export async function handleCrawl4aiProxySubmit(req: Request): Promise<Response> {
  const body = await req.json();
  const targetUrl = `${config.CRAWL4AI_URL}crawl/job`;
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return new Response(res.body, { status: res.status, headers: res.headers });
}

export async function handleCrawl4aiProxyPoll(_req: Request, id: string): Promise<Response> {
  const targetUrl = `${config.CRAWL4AI_URL}crawl/job/${id}`;
  const res = await fetch(targetUrl);
  return new Response(res.body, { status: res.status, headers: res.headers });
}

export async function handleSearxngProxy(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = new URL(`${config.SEARXNG_URL}search`);
  for (const [key, value] of url.searchParams) {
    targetUrl.searchParams.set(key, value);
  }
  const res = await fetch(targetUrl.toString());
  return new Response(res.body, { status: res.status, headers: res.headers });
}
