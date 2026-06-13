import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { startMockCrawl4ai, stopMockServer, resetCrawl4aiTasks, setCrawl4aiDelay, type MockServer } from "../mock-server.ts";

const PROXY_PORT = 13003;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

describe("POST /v2/scrape", () => {
  let mockCrawl4ai: MockServer;
  let proxy: ReturnType<typeof Bun.spawn>;

  beforeAll(async () => {
    mockCrawl4ai = startMockCrawl4ai(11235);

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
    stopMockServer(mockCrawl4ai);
  });

  beforeEach(() => {
    resetCrawl4aiTasks();
    setCrawl4aiDelay(0);
  });

  it("returns 200 with Firecrawl-shaped response", async () => {
    const res = await fetch(`${PROXY_URL}/v2/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data?.markdown).toBe("string");
    expect(body.data?.metadata).toBeDefined();
    expect(body.data?.metadata?.statusCode).toBe(200);
  });

  it("returns 400 when url is missing", async () => {
    const res = await fetch(`${PROXY_URL}/v2/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("url");
  });

  it("returns 504 when Crawl4AI job never completes", async () => {
    // Set a long delay so the proxy times out before auto-completion
    setCrawl4aiDelay(10_000);

    const res = await fetch(`${PROXY_URL}/v2/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("timed out");
  });

  it("includes screenshot when formats includes screenshot", async () => {
    const res = await fetch(`${PROXY_URL}/v2/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        formats: ["screenshot"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data?.screenshot).toBe("string");
  });

  it("includes html when formats includes html", async () => {
    const res = await fetch(`${PROXY_URL}/v2/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        formats: ["html"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data?.html).toBe("string");
  });

  it("includes rawHtml when formats includes rawHtml", async () => {
    const res = await fetch(`${PROXY_URL}/v2/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com",
        formats: ["rawHtml"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data?.rawHtml).toBe("string");
  });

  it("returns 502 when Crawl4AI is unreachable", async () => {
    // Stop the mock server to simulate unreachable backend
    stopMockServer(mockCrawl4ai);

    const res = await fetch(`${PROXY_URL}/v2/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });
});
