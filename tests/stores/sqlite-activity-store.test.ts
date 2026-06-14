import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import {
  initActivityStore,
  clearActivityStore,
  closeActivityStore,
  insertActivityLog,
  queryActivityLogs,
  getMetricsFromStore,
} from "../../src/stores/sqlite-activity-store.ts";
import type { ActivityLog } from "../../src/types/dashboard.ts";

describe("sqlite-activity-store", () => {
  beforeEach(() => {
    initActivityStore(":memory:");
    clearActivityStore();
  });

  afterAll(() => {
    closeActivityStore();
  });

  function makeLog(overrides: Partial<ActivityLog> = {}): ActivityLog {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      method: "POST",
      path: "/v2/search",
      status: 200,
      durationMs: 42,
      ...overrides,
    };
  }

  it("inserts high-priority logs", () => {
    insertActivityLog(makeLog());
    const result = queryActivityLogs({});
    expect(result.total).toBe(1);
    expect(result.logs[0].path).toBe("/v2/search");
  });

  it("ignores low-priority logs", () => {
    insertActivityLog(makeLog({ path: "/v2/health", method: "GET" }));
    const result = queryActivityLogs({});
    expect(result.total).toBe(0);
  });

  it("ignores dynamic low-priority paths", () => {
    insertActivityLog(
      makeLog({
        path: "/api/proxy/crawl4ai/crawl/job/",
        method: "GET",
      })
    );
    const result = queryActivityLogs({});
    expect(result.total).toBe(0);
  });

  it("matches dynamic poll path", () => {
    insertActivityLog(
      makeLog({
        path: "/api/proxy/crawl4ai/crawl/job/abc123",
        method: "GET",
      })
    );
    const result = queryActivityLogs({});
    expect(result.total).toBe(1);
  });

  it("queries with pagination", () => {
    for (let i = 0; i < 5; i++) {
      insertActivityLog(
        makeLog({
          id: `id-${i}`,
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
        })
      );
    }

    const page1 = queryActivityLogs({ page: 1, limit: 2 });
    expect(page1.logs.length).toBe(2);
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);

    const page2 = queryActivityLogs({ page: 2, limit: 2 });
    expect(page2.logs.length).toBe(2);
    expect(page2.page).toBe(2);
  });

  it("filters by method", () => {
    insertActivityLog(makeLog({ method: "POST", path: "/v2/search" }));
    insertActivityLog(makeLog({ method: "GET", path: "/api/proxy/searxng/search" }));

    const result = queryActivityLogs({ method: "GET" });
    expect(result.total).toBe(1);
    expect(result.logs[0].method).toBe("GET");
  });

  it("filters by path", () => {
    insertActivityLog(makeLog({ path: "/v2/search" }));
    insertActivityLog(makeLog({ path: "/v2/scrape" }));

    const result = queryActivityLogs({ path: "/v2/scrape" });
    expect(result.total).toBe(1);
    expect(result.logs[0].path).toBe("/v2/scrape");
  });

  it("filters by status", () => {
    insertActivityLog(makeLog({ status: 200 }));
    insertActivityLog(makeLog({ status: 502 }));

    const result = queryActivityLogs({ status: 502 });
    expect(result.total).toBe(1);
    expect(result.logs[0].status).toBe(502);
  });

  it("filters by time range", () => {
    const now = Date.now();
    insertActivityLog(
      makeLog({ timestamp: new Date(now - 1000).toISOString() })
    );
    insertActivityLog(
      makeLog({ timestamp: new Date(now - 5000).toISOString() })
    );

    const result = queryActivityLogs({
      startTime: new Date(now - 2000).toISOString(),
    });
    expect(result.total).toBe(1);
  });

  it("searches across text fields", () => {
    insertActivityLog(
      makeLog({ requestBody: JSON.stringify({ query: "bun test" }) })
    );
    insertActivityLog(makeLog({ responseBody: "hello world" }));

    const result = queryActivityLogs({ search: "bun" });
    expect(result.total).toBe(1);
    expect(result.logs[0].requestBody).toContain("bun");
  });

  it("returns newest first", () => {
    insertActivityLog(makeLog({ id: "old", timestamp: "2024-01-01T00:00:00Z" }));
    insertActivityLog(makeLog({ id: "new", timestamp: "2024-06-01T00:00:00Z" }));

    const result = queryActivityLogs({});
    expect(result.logs[0].id).toBe("new");
    expect(result.logs[1].id).toBe("old");
  });

  it("truncates long bodies", () => {
    const longBody = "x".repeat(60_000);
    insertActivityLog(makeLog({ requestBody: longBody }));

    const result = queryActivityLogs({});
    expect(result.logs[0].requestBody!.length).toBeLessThan(longBody.length);
    expect(result.logs[0].requestBody!).toContain("...[truncated]");
  });

  it("computes metrics summary", () => {
    insertActivityLog(makeLog({ status: 200, durationMs: 10 }));
    insertActivityLog(makeLog({ status: 200, durationMs: 20 }));
    insertActivityLog(makeLog({ status: 502, durationMs: 30 }));

    const metrics = getMetricsFromStore("1h");
    expect(metrics.summary.totalRequests).toBe(3);
    expect(metrics.summary.successCount).toBe(2);
    expect(metrics.summary.failedCount).toBe(1);
    expect(metrics.summary.averageLatencyMs).toBe(20);
  });

  it("computes time series buckets", () => {
    const now = new Date();
    insertActivityLog(
      makeLog({
        timestamp: now.toISOString(),
        durationMs: 10,
        status: 200,
      })
    );

    const metrics = getMetricsFromStore("1m");
    expect(metrics.timeSeries.length).toBeGreaterThanOrEqual(1);
    expect(metrics.timeSeries[0].count).toBe(1);
    expect(metrics.timeSeries[0].avgLatencyMs).toBe(10);
    expect(metrics.timeSeries[0].errorCount).toBe(0);
  });

  it("handles empty store gracefully", () => {
    const result = queryActivityLogs({});
    expect(result.total).toBe(0);
    expect(result.logs.length).toBe(0);

    const metrics = getMetricsFromStore("5m");
    expect(metrics.summary.totalRequests).toBe(0);
    expect(metrics.timeSeries.length).toBe(0);
  });
});
