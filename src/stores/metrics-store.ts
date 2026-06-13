import { getAllLogs } from "../logger.ts";
import type { MetricsResponse, TimeSeriesPoint, MetricsSummary } from "../types/dashboard.ts";

const GRANULARITY_MS: Record<"1m" | "5m" | "15m" | "1h", number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
};

export function getMetrics(granularity: "1m" | "5m" | "15m" | "1h"): MetricsResponse {
  const logs = getAllLogs();
  const bucketMs = GRANULARITY_MS[granularity];

  const summary: MetricsSummary = {
    totalRequests: logs.length,
    successCount: 0,
    failedCount: 0,
    averageLatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    requestsPerEndpoint: {},
  };

  const latencies: number[] = [];
  const buckets = new Map<string, { count: number; latencies: number[]; errors: number }>();

  for (const log of logs) {
    if (log.status < 400) {
      summary.successCount++;
    } else {
      summary.failedCount++;
    }

    latencies.push(log.durationMs);

    const endpoint = `${log.method} ${log.path}`;
    summary.requestsPerEndpoint[endpoint] = (summary.requestsPerEndpoint[endpoint] ?? 0) + 1;

    const ts = new Date(log.timestamp).getTime();
    const bucketStart = Math.floor(ts / bucketMs) * bucketMs;
    const bucketKey = new Date(bucketStart).toISOString();

    const bucket = buckets.get(bucketKey) ?? { count: 0, latencies: [], errors: 0 };
    bucket.count++;
    bucket.latencies.push(log.durationMs);
    if (log.status >= 400) bucket.errors++;
    buckets.set(bucketKey, bucket);
  }

  if (latencies.length > 0) {
    summary.averageLatencyMs = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const sorted = [...latencies].sort((a, b) => a - b);
    summary.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0;
    summary.p99LatencyMs = sorted[Math.floor(sorted.length * 0.99)] ?? sorted[sorted.length - 1] ?? 0;
  }

  const timeSeries: TimeSeriesPoint[] = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([timestamp, bucket]) => ({
      timestamp,
      count: bucket.count,
      avgLatencyMs: bucket.count > 0 ? Math.round(bucket.latencies.reduce((a, b) => a + b, 0) / bucket.count) : 0,
      errorCount: bucket.errors,
    }));

  return { summary, timeSeries };
}
