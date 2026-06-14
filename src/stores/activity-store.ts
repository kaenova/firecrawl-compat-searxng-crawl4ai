import { queryActivityLogs } from "./sqlite-activity-store.ts";
import type { ActivityQuery, ActivityResponse } from "../types/dashboard.ts";

export function queryActivity(query: ActivityQuery): ActivityResponse {
  return queryActivityLogs(query);
}
