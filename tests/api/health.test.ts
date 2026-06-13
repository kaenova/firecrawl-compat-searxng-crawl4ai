import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const PROXY_PORT = 13004;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;

describe("GET /v2/health", () => {
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

  it("returns { status: ok } with 200", async () => {
    const res = await fetch(`${PROXY_URL}/v2/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });
});
