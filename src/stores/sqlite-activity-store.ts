import { Database } from "bun:sqlite";
import { createDb } from "../db.ts";
import { isHighPriorityPath } from "./activity-paths.ts";
import type {
  ActivityLog,
  ActivityQuery,
  ActivityResponse,
  MetricsResponse,
  MetricsSummary,
  TimeSeriesPoint,
} from "../types/dashboard.ts";

const MAX_BODY_LENGTH = 50_000;

let dbInstance: Database | null = null;

function truncateBody(body: string | undefined): string | undefined {
  if (!body) return undefined;
  if (body.length > MAX_BODY_LENGTH) {
    return body.slice(0, MAX_BODY_LENGTH) + "...[truncated]";
  }
  return body;
}

/** Initialize (or re-initialize) the SQLite activity store. */
export function initActivityStore(dbPath?: string): void {
  dbInstance = createDb(dbPath ?? "activity.db");
}

/** Clear all rows from the activity table. Useful for tests. */
export function clearActivityStore(): void {
  const db = getDb();
  db.run(`DELETE FROM activity_logs`);
}

/** Close the database connection. */
export function closeActivityStore(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function getDb(): Database {
  if (!dbInstance) {
    initActivityStore();
  }
  return dbInstance!;
}

/**
 * Insert an activity log into SQLite.
 * Only high-priority paths are persisted (others are silently ignored).
 */
export function insertActivityLog(log: ActivityLog): void {
  if (!isHighPriorityPath(log.method, log.path)) {
    return;
  }

  const db = getDb();
  db.run(
    `INSERT INTO activity_logs
      (id, timestamp, method, path, status, duration_ms, request_body, response_body, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    log.id,
    log.timestamp,
    log.method,
    log.path,
    log.status,
    log.durationMs,
    truncateBody(log.requestBody),
    truncateBody(log.responseBody),
    log.error
  );
}

/**
 * Query persisted activity logs with filtering, search, and pagination.
 * Returns newest-first.
 */
export function queryActivityLogs(query: ActivityQuery): ActivityResponse {
  const db = getDb();

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (query.search) {
    conditions.push(`(
      method LIKE ? OR
      path LIKE ? OR
      COALESCE(request_body, '') LIKE ? OR
      COALESCE(response_body, '') LIKE ? OR
      COALESCE(error, '') LIKE ?
    )`);
    const term = `%${query.search}%`;
    params.push(term, term, term, term, term);
  }

  if (query.method) {
    conditions.push("method = ?");
    params.push(query.method);
  }

  if (query.path) {
    conditions.push("path = ?");
    params.push(query.path);
  }

  if (query.status !== undefined) {
    conditions.push("status = ?");
    params.push(query.status);
  }

  if (query.startTime) {
    conditions.push("timestamp >= ?");
    params.push(query.startTime);
  }

  if (query.endTime) {
    conditions.push("timestamp <= ?");
    params.push(query.endTime);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total matching rows
  const countSql = `SELECT COUNT(*) as count FROM activity_logs ${whereClause}`;
  const countRow = db.query(countSql).get(...params) as {
    count: number;
  } | null;
  const total = countRow?.count ?? 0;

  // Fetch paginated results
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  const offset = (page - 1) * limit;

  const querySql = `
    SELECT
      id,
      timestamp,
      method,
      path,
      status,
      duration_ms as durationMs,
      request_body as requestBody,
      response_body as responseBody,
      error
    FROM activity_logs
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `;

  const rows = db
    .query(querySql)
    .all(...params, limit, offset) as Array<{
    id: string;
    timestamp: string;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    requestBody: string | null;
    responseBody: string | null;
    error: string | null;
  }>;

  const logs: ActivityLog[] = rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    method: r.method,
    path: r.path,
    status: r.status,
    durationMs: r.durationMs,
    requestBody: r.requestBody ?? undefined,
    responseBody: r.responseBody ?? undefined,
    error: r.error ?? undefined,
  }));

  return { logs, total, page, limit };
}

const GRANULARITY_MS: Record<"1m" | "5m" | "15m" | "1h", number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
};

/**
 * Compute metrics summary and time-series from persisted activity logs.
 */
export function getMetricsFromStore(
  granularity: "1m" | "5m" | "15m" | "1h"
): MetricsResponse {
  const db = getDb();
  const bucketMs = GRANULARITY_MS[granularity];

  const rows = db
    .query(
      `SELECT timestamp, status, duration_ms as durationMs, method, path
       FROM activity_logs
       ORDER BY timestamp ASC`
    )
    .all() as Array<{
    timestamp: string;
    status: number;
    durationMs: number;
    method: string;
    path: string;
  }>;

  const summary: MetricsSummary = {
    totalRequests: rows.length,
    successCount: 0,
    failedCount: 0,
    averageLatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    requestsPerEndpoint: {},
  };

  const latencies: number[] = [];
  const buckets = new Map<
    string,
    { count: number; latencies: number[]; errors: number }
  >();

  for (const log of rows) {
    if (log.status < 400) {
      summary.successCount++;
    } else {
      summary.failedCount++;
    }

    latencies.push(log.durationMs);

    const endpoint = `${log.method} ${log.path}`;
    summary.requestsPerEndpoint[endpoint] =
      (summary.requestsPerEndpoint[endpoint] ?? 0) + 1;

    const ts = new Date(log.timestamp).getTime();
    const bucketStart = Math.floor(ts / bucketMs) * bucketMs;
    const bucketKey = new Date(bucketStart).toISOString();

    const bucket = buckets.get(bucketKey) ?? {
      count: 0,
      latencies: [],
      errors: 0,
    };
    bucket.count++;
    bucket.latencies.push(log.durationMs);
    if (log.status >= 400) bucket.errors++;
    buckets.set(bucketKey, bucket);
  }

  if (latencies.length > 0) {
    summary.averageLatencyMs = Math.round(
      latencies.reduce((a, b) => a + b, 0) / latencies.length
    );
    const sorted = [...latencies].sort((a, b) => a - b);
    summary.p95LatencyMs =
      sorted[Math.floor(sorted.length * 0.95)] ??
      sorted[sorted.length - 1] ??
      0;
    summary.p99LatencyMs =
      sorted[Math.floor(sorted.length * 0.99)] ??
      sorted[sorted.length - 1] ??
      0;
  }

  const timeSeries: TimeSeriesPoint[] = Array.from(buckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([timestamp, bucket]) => ({
      timestamp,
      count: bucket.count,
      avgLatencyMs:
        bucket.count > 0
          ? Math.round(
              bucket.latencies.reduce((a, b) => a + b, 0) / bucket.count
            )
          : 0,
      errorCount: bucket.errors,
    }));

  return { summary, timeSeries };
}
