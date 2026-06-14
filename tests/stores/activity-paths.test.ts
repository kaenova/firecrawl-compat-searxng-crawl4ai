import { describe, it, expect } from "bun:test";
import { isHighPriorityPath } from "../../src/stores/activity-paths.ts";

describe("activity-paths allowlist", () => {
  it("matches exact high-priority /v2 paths", () => {
    expect(isHighPriorityPath("POST", "/v2/search")).toBe(true);
    expect(isHighPriorityPath("POST", "/v2/scrape")).toBe(true);
  });

  it("rejects low-priority paths", () => {
    expect(isHighPriorityPath("GET", "/v2/health")).toBe(false);
    expect(isHighPriorityPath("GET", "/api/metrics")).toBe(false);
    expect(isHighPriorityPath("GET", "/api/activity")).toBe(false);
    expect(isHighPriorityPath("GET", "/")).toBe(false);
    expect(isHighPriorityPath("POST", "/v2/crawl")).toBe(false);
  });

  it("rejects playground proxy paths", () => {
    expect(
      isHighPriorityPath("GET", "/api/proxy/searxng/search")
    ).toBe(false);
    expect(
      isHighPriorityPath("POST", "/api/proxy/crawl4ai/crawl/job")
    ).toBe(false);
    expect(
      isHighPriorityPath("GET", "/api/proxy/crawl4ai/crawl/job/abc123")
    ).toBe(false);
  });

  it("rejects wrong method for exact paths", () => {
    expect(isHighPriorityPath("GET", "/v2/search")).toBe(false);
    expect(isHighPriorityPath("GET", "/v2/scrape")).toBe(false);
    expect(isHighPriorityPath("POST", "/v2/health")).toBe(false);
  });
});
