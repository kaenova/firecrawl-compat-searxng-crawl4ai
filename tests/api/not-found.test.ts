import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const PROXY_PORT = 13005;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

describe("404 handling", () => {
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

  it("returns 404 for POST /v2/crawl", async () => {
    const res = await fetch(`${PROXY_URL}/v2/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com" }),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("Not found");
  });

  it("returns 404 for unknown paths", async () => {
    const res = await fetch(`${PROXY_URL}/v2/map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toContain("Not found");
  });
});
