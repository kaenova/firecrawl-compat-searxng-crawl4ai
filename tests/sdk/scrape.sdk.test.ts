import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { FirecrawlClient } from "firecrawl";

const PROXY_PORT = 13002;
const MOCK_CRAWL4AI_PORT = 11235;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

let app: FirecrawlClient;
let mockCrawl4ai: ReturnType<typeof Bun.serve>;
let proxyProc: ReturnType<typeof Bun.spawn>;

beforeAll(async () => {
  mockCrawl4ai = Bun.serve({
    port: MOCK_CRAWL4AI_PORT,
    fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (pathname === "/crawl/job" && req.method === "POST") {
        return Response.json({ task_id: "mock-task-123" }, { status: 202 });
      }

      if (pathname === "/crawl/job/mock-task-123" && req.method === "GET") {
        return Response.json({
          task_id: "mock-task-123",
          status: "completed",
          result: {
            markdown: "# Hello World\n\nThis is markdown.",
            html: "<h1>Hello World</h1><p>This is html.</p>",
            metadata: {
              title: "Example Page",
              description: "An example page",
              source_url: "https://example.com",
              status_code: 200,
            },
          },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  proxyProc = Bun.spawn({
    cmd: ["bun", "run", "src/index.ts"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      SEARXNG_URL: "http://localhost:18080",
      CRAWL4AI_URL: `http://localhost:${MOCK_CRAWL4AI_PORT}`,
      PORT: String(PROXY_PORT),
      POLL_INTERVAL: "100",
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${PROXY_URL}/v2/health`);
      if (res.status === 200) break;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  app = new FirecrawlClient({ apiKey: "test-key", apiUrl: PROXY_URL });
});

afterAll(() => {
  proxyProc?.kill();
  mockCrawl4ai?.stop();
});

describe("SDK scrape integration", () => {
  it("app.scrape(url, { formats: ['markdown'] }) returns markdown", async () => {
    const result = await app.scrape("https://example.com", {
      formats: ["markdown"],
    });
    expect(result).toBeDefined();
    expect(typeof result.markdown).toBe("string");
    expect(result.markdown).toContain("Hello World");
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.title).toBe("Example Page");
  });

  it("app.scrape(url, { formats: ['html'] }) returns html", async () => {
    const result = await app.scrape("https://example.com", {
      formats: ["html"],
    });
    expect(result).toBeDefined();
    expect(typeof result.html).toBe("string");
    expect(result.html).toContain("<h1>Hello World</h1>");
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.statusCode).toBe(200);
  });
});
