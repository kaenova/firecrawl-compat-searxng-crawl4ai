import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const PROXY_PORT = 13006;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

describe("Dashboard API", () => {
  let proxy: ReturnType<typeof Bun.spawn>;

  beforeAll(async () => {
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
  });

  it("GET /api/metrics returns 200 with summary and timeSeries", async () => {
    const res = await fetch(`${PROXY_URL}/api/metrics`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { totalRequests: number };
      timeSeries: unknown[];
    };
    expect(body.summary).toBeDefined();
    expect(typeof body.summary.totalRequests).toBe("number");
    expect(Array.isArray(body.timeSeries)).toBe(true);
  });

  it("GET /api/activity returns 200 with logs array", async () => {
    const res = await fetch(`${PROXY_URL}/api/activity`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: unknown[];
      total: number;
      page: number;
      limit: number;
    };
    expect(Array.isArray(body.logs)).toBe(true);
    expect(typeof body.total).toBe("number");
    expect(typeof body.page).toBe("number");
    expect(typeof body.limit).toBe("number");
  });

  it("GET /api/activity?search=query filters correctly", async () => {
    // Ensure at least one POST /v2/search request exists in SQLite logs
    await fetch(`${PROXY_URL}/v2/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "dashboard query test" }),
    });
    await new Promise((r) => setTimeout(r, 50));

    const res = await fetch(`${PROXY_URL}/api/activity?search=dashboard%20query%20test`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: Array<{ path: string }>;
    };
    expect(body.logs.length).toBeGreaterThan(0);
    expect(body.logs.some((log) => log.path === "/v2/search")).toBe(true);
  });

  it("GET /api/activity?status=200 filters correctly", async () => {
    const res = await fetch(`${PROXY_URL}/api/activity?status=200`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      logs: Array<{ status: number }>;
    };
    expect(Array.isArray(body.logs)).toBe(true);
    expect(body.logs.every((log) => log.status === 200)).toBe(true);
  });
});
