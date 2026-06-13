import { describe, it, expect } from "bun:test";
import { logFailure, logRequest } from "../../src/logger.ts";

describe("request logging", () => {
  it("emits structured JSON for completed requests", () => {
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      logRequest({ method: "GET", path: "/v2/health", status: 200, durationMs: 12, requestId: "req-1" });
    } finally {
      console.log = originalLog;
    }

    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]) as {
      level: string;
      event: string;
      method: string;
      path: string;
      status: number;
      durationMs: number;
      requestId: string;
    };

    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("request.completed");
    expect(parsed.method).toBe("GET");
    expect(parsed.path).toBe("/v2/health");
    expect(parsed.status).toBe(200);
    expect(parsed.durationMs).toBe(12);
    expect(parsed.requestId).toBe("req-1");
  });

  it("emits structured JSON for failures", () => {
    const originalError = console.error;
    const logs: string[] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      logFailure({ method: "POST", path: "/v2/search", status: 502, durationMs: 3, error: new Error("boom") });
    } finally {
      console.error = originalError;
    }

    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]) as {
      level: string;
      event: string;
      method: string;
      path: string;
      status: number;
      error: string;
    };

    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("request.failed");
    expect(parsed.method).toBe("POST");
    expect(parsed.path).toBe("/v2/search");
    expect(parsed.status).toBe(502);
    expect(parsed.error).toBe("boom");
  });
});
