import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  startMockCrawl4ai,
  startMockSearxng,
  stopMockServer,
  type MockServer,
} from "../mock-server.ts";

const PROXY_PORT = 13007;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

describe("Playground Proxy Routes", () => {
  let mockCrawl4ai: MockServer;
  let mockSearxng: MockServer;
  let proxy: ReturnType<typeof Bun.spawn>;

  beforeAll(async () => {
    mockCrawl4ai = startMockCrawl4ai(11236);
    mockSearxng = startMockSearxng(18081);

    proxy = Bun.spawn({
      cmd: ["bun", "run", "src/index.ts"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        SEARXNG_URL: "http://localhost:18081",
        CRAWL4AI_URL: "http://localhost:11236",
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
    stopMockServer(mockSearxng);
  });

  describe("POST /api/proxy/crawl4ai/crawl/job", () => {
    it("returns 400 for invalid JSON body", async () => {
      const res = await fetch(`${PROXY_URL}/api/proxy/crawl4ai/crawl/job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("Invalid JSON");
    });

    it("returns 502 when Crawl4AI is unreachable", async () => {
      stopMockServer(mockCrawl4ai);

      const res = await fetch(`${PROXY_URL}/api/proxy/crawl4ai/crawl/job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      });

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("unavailable");

      // Restart for subsequent tests
      mockCrawl4ai = startMockCrawl4ai(11236);
    });

    it("returns 200 on success", async () => {
      const res = await fetch(`${PROXY_URL}/api/proxy/crawl4ai/crawl/job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body).toHaveProperty("task_id");
    });
  });

  describe("GET /api/proxy/crawl4ai/crawl/job/:id", () => {
    it("returns 502 when Crawl4AI is unreachable", async () => {
      stopMockServer(mockCrawl4ai);

      const res = await fetch(`${PROXY_URL}/api/proxy/crawl4ai/crawl/job/some-id`);

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("unavailable");

      // Restart for subsequent tests
      mockCrawl4ai = startMockCrawl4ai(11236);
    });

    it("returns 200 on success", async () => {
      const submitRes = await fetch(`${PROXY_URL}/api/proxy/crawl4ai/crawl/job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://example.com" }),
      });
      const submitBody = await submitRes.json();
      const taskId = submitBody.task_id;

      const res = await fetch(`${PROXY_URL}/api/proxy/crawl4ai/crawl/job/${taskId}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("status");
    });
  });

  describe("GET /api/proxy/searxng/search", () => {
    it("returns 502 when SearXNG is unreachable", async () => {
      stopMockServer(mockSearxng);

      const res = await fetch(`${PROXY_URL}/api/proxy/searxng/search?q=test`);

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain("unavailable");

      // Restart for subsequent tests
      mockSearxng = startMockSearxng(18081);
    });

    it("returns 200 on success", async () => {
      const res = await fetch(`${PROXY_URL}/api/proxy/searxng/search?q=hello`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("results");
    });
  });
});
