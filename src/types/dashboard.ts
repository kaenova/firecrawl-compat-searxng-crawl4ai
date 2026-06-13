// Shared API types for Dashboard / Activity / Metrics
// Consumed by both backend (Bun) and frontend (React)

export interface ActivityLog {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestBody?: string;
  responseBody?: string;
  error?: string;
}

export interface MetricsSummary {
  totalRequests: number;
  successCount: number;
  failedCount: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  requestsPerEndpoint: Record<string, number>;
}

export interface TimeSeriesPoint {
  timestamp: string; // ISO8601 bucket key
  count: number;
  avgLatencyMs: number;
  errorCount: number;
}

export interface MetricsResponse {
  summary: MetricsSummary;
  timeSeries: TimeSeriesPoint[];
}

export interface ActivityQuery {
  search?: string;
  method?: string;
  path?: string;
  status?: number;
  startTime?: string;
  endTime?: string;
  page?: number;
  limit?: number;
}

export interface ActivityResponse {
  logs: ActivityLog[];
  total: number;
  page: number;
  limit: number;
}
