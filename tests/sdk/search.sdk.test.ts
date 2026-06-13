import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { FirecrawlClient } from "firecrawl";

const PROXY_PORT = 13002;
const MOCK_SEARXNG_PORT = 18080;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

let app: FirecrawlClient;
let mockSearxng: ReturnType<typeof Bun.serve>;
let proxyProc: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  // 1. Start mock SearXNG server
  mockSearxng = Bun.serve({
    port: MOCK_SEARXNG_PORT,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/search") {
        const results = Array.from({ length: 10 }, (_, i) => ({
          url: `https://example${i}.com`,
          title: `Result ${i}`,
          content: `Description ${i}`,
          category: "general",
        }));
        return Response.json({ results });
      }
      return new Response("Not found", { status: 404 });
    },
  });

  // 2. Spawn proxy as child process
  proxyProc = Bun.spawn({
    cmd: ["bun", "run", "src/index.ts"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      SEARXNG_URL: `http://localhost:${MOCK_SEARXNG_PORT}`,
      CRAWL4AI_URL: "http://localhost:11235",
      PORT: String(PROXY_PORT),
      POLL_INTERVAL: "100",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  // 3. Wait for proxy to be ready
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${PROXY_URL}/v2/health`);
      if (res.status === 200) break;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  // 4. Initialize SDK client pointing at proxy
  app = new FirecrawlClient({ apiKey: "test-key", apiUrl: PROXY_URL });
});

afterAll(() => {
  proxyProc?.kill();
  mockSearxng?.stop();
});

describe("SDK search integration", () => {
  it("app.search('test query') returns web array", async () => {
    const result = await app.search("test query");
    expect(result).toBeDefined();
    expect(Array.isArray(result.web)).toBe(true);
    expect(result.web!.length).toBeGreaterThan(0);
    expect(result.web![0]).toMatchObject({
      url: expect.any(String),
      title: expect.any(String),
      description: expect.any(String),
    });
  });

  it("app.search('query', { limit: 5 }) returns at most 5 results", async () => {
    const result = await app.search("query", { limit: 5 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.web)).toBe(true);
    expect(result.web!.length).toBeLessThanOrEqual(5);
  });
});
