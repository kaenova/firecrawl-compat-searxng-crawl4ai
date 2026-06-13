import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { startMockSearxng, stopMockServer, type MockServer } from "../mock-server.ts";

const PROXY_PORT = 13002;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

describe("POST /v2/search", () => {
  let mockSearxng: MockServer;
  let proxy: ReturnType<typeof Bun.spawn>;

  beforeAll(async () => {
    mockSearxng = startMockSearxng(18080);

    proxy = Bun.spawn({
      cmd: ["bun", "run", "src/index.ts"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        SEARXNG_URL: "http://localhost:18080",
        CRAWL4AI_URL: "http://localhost:11235",
        PORT: String(PROXY_PORT),
        SCRAPE_TIMEOUT: "2",
        POLL_INTERVAL: "100",
      },
      stdout: "inherit",
      stderr: "inherit",
    });

    // Wait for proxy to be ready
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${PROXY_URL}/v2/health`);
        if (res.ok) break;
      } catch {
        // not ready yet
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  afterAll(() => {
    try {
      proxy.kill(9);
    } catch {
      // ignore
    }
    stopMockServer(mockSearxng);
  });

  it("returns 200 with Firecrawl-shaped response", async () => {
    const res = await fetch(`${PROXY_URL}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test query" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data?.web)).toBe(true);
    expect(body.data.web.length).toBeGreaterThan(0);
    expect(body.data.web[0]).toHaveProperty("url");
    expect(body.data.web[0]).toHaveProperty("title");
    expect(body.data.web[0]).toHaveProperty("description");
  });

  it("returns 400 when query is missing", async () => {
    const res = await fetch(`${PROXY_URL}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("query");
  });

  it("returns 502 when SearXNG is unreachable", async () => {
    // Stop the mock server to simulate unreachable backend
    stopMockServer(mockSearxng);

    const res = await fetch(`${PROXY_URL}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test query" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Search backend unavailable");

    // Restart mock for any subsequent tests
    mockSearxng = startMockSearxng(18080);
  });

  it("forwards query to SearXNG as q", async () => {
    const res = await fetch(`${PROXY_URL}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "hello world" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const echo = JSON.parse(body.data.web[0].description) as { q: string };
    expect(echo.q).toBe("hello world");
  });

  it("maps page to SearXNG pageno", async () => {
    const res = await fetch(`${PROXY_URL}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "test", page: 3 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const echo = JSON.parse(body.data.web[0].description) as { pageno: string };
    expect(echo.pageno).toBe("3");
  });

  it("transforms includeDomains into site: syntax", async () => {
    const res = await fetch(`${PROXY_URL}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "test query",
        includeDomains: ["example.com", "example.org"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const echo = JSON.parse(body.data.web[0].description) as { q: string };
    expect(echo.q).toContain("site:example.com");
    expect(echo.q).toContain("site:example.org");
    expect(echo.q).toContain("OR");
  });

  it("transforms excludeDomains into -site: syntax", async () => {
    const res = await fetch(`${PROXY_URL}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "test query",
        excludeDomains: ["spam.com"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    const echo = JSON.parse(body.data.web[0].description) as { q: string };
    expect(echo.q).toContain("-site:spam.com");
  });
});
