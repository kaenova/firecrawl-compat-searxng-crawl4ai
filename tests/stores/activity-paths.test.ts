import { describe, it, expect } from "bun:test";
import { isHighPriorityPath } from "../../src/stores/activity-paths.ts";

describe("activity-paths allowlist", () => {
  it("matches exact high-priority paths", () => {
    expect(isHighPriorityPath("POST", "/v2/search")).toBe(true);
    expect(isHighPriorityPath("POST", "/v2/scrape")).toBe(true);
    expect(isHighPriorityPath("GET", "/api/proxy/searxng/search")).toBe(true);
    expect(isHighPriorityPath("POST", "/api/proxy/crawl4ai/crawl/job")).toBe(true);
  });

  it("matches dynamic crawl4ai poll path", () => {
    expect(
      isHighPriorityPath("GET", "/api/proxy/crawl4ai/crawl/job/abc123")
    ).toBe(true);
    expect(
      isHighPriorityPath("GET", "/api/proxy/crawl4ai/crawl/job/crawl_7e72e928")
    ).toBe(true);
  });

  it("rejects low-priority paths", () => {
    expect(isHighPriorityPath("GET", "/v2/health")).toBe(false);
    expect(isHighPriorityPath("GET", "/api/metrics")).toBe(false);
    expect(isHighPriorityPath("GET", "/api/activity")).toBe(false);
    expect(isHighPriorityPath("GET", "/")).toBe(false);
    expect(isHighPriorityPath("POST", "/v2/crawl")).toBe(false);
  });

  it("rejects wrong method for exact paths", () => {
    expect(isHighPriorityPath("GET", "/v2/search")).toBe(false);
    expect(isHighPriorityPath("GET", "/v2/scrape")).toBe(false);
    expect(isHighPriorityPath("POST", "/api/proxy/searxng/search")).toBe(false);
  });

  it("rejects malformed dynamic paths", () => {
    expect(
      isHighPriorityPath("GET", "/api/proxy/crawl4ai/crawl/job/")
    ).toBe(false);
    expect(
      isHighPriorityPath("GET", "/api/proxy/crawl4ai/crawl/job/abc/extra")
    ).toBe(false);
    expect(
      isHighPriorityPath("POST", "/api/proxy/crawl4ai/crawl/job/abc123")
    ).toBe(false);
  });
});
