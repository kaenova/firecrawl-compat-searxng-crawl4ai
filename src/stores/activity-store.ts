import { getAllLogs } from "../logger.ts";
import type { ActivityQuery, ActivityResponse } from "../types/dashboard.ts";

export function queryActivity(query: ActivityQuery): ActivityResponse {
  let logs = getAllLogs();

  if (query.search) {
    const term = query.search.toLowerCase();
    logs = logs.filter((log) => {
      const haystack = [
        log.method,
        log.path,
        log.requestBody ?? "",
        log.responseBody ?? "",
        log.error ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }

  if (query.method) {
    logs = logs.filter((log) => log.method === query.method);
  }

  if (query.path) {
    logs = logs.filter((log) => log.path === query.path);
  }

  if (query.status !== undefined) {
    logs = logs.filter((log) => log.status === query.status);
  }

  if (query.startTime) {
    const start = new Date(query.startTime).getTime();
    logs = logs.filter((log) => new Date(log.timestamp).getTime() >= start);
  }

  if (query.endTime) {
    const end = new Date(query.endTime).getTime();
    logs = logs.filter((log) => new Date(log.timestamp).getTime() <= end);
  }

  const total = logs.length;
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  const startIndex = (page - 1) * limit;
  const paginated = logs.slice(startIndex, startIndex + limit);

  return {
    logs: paginated,
    total,
    page,
    limit,
  };
}
