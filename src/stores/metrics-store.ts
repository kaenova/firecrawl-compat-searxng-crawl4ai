import { getMetricsFromStore } from "./sqlite-activity-store.ts";
import type { MetricsResponse } from "../types/dashboard.ts";

export function getMetrics(granularity: "1m" | "5m" | "15m" | "1h"): MetricsResponse {
  return getMetricsFromStore(granularity);
}
