import { getAllLogs } from "../logger.ts";
import { queryActivityLogs } from "./sqlite-activity-store.ts";
import { isHighPriorityPath } from "./activity-paths.ts";
import type { ActivityQuery, ActivityResponse } from "../types/dashboard.ts";

export function queryActivity(query: ActivityQuery): ActivityResponse {
  // Baca data high-priority yang dipersist ke SQLite
  const sqliteResult = queryActivityLogs(query);

  // Baca data low-priority dari in-memory buffer untuk backward compat
  let memoryLogs = getAllLogs().filter(
    (log) => !isHighPriorityPath(log.method, log.path)
  );

  if (query.search) {
    const term = query.search.toLowerCase();
    memoryLogs = memoryLogs.filter((log) => {
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
    memoryLogs = memoryLogs.filter((log) => log.method === query.method);
  }

  if (query.path) {
    memoryLogs = memoryLogs.filter((log) => log.path === query.path);
  }

  if (query.status !== undefined) {
    memoryLogs = memoryLogs.filter((log) => log.status === query.status);
  }

  if (query.startTime) {
    const start = new Date(query.startTime).getTime();
    memoryLogs = memoryLogs.filter(
      (log) => new Date(log.timestamp).getTime() >= start
    );
  }

  if (query.endTime) {
    const end = new Date(query.endTime).getTime();
    memoryLogs = memoryLogs.filter(
      (log) => new Date(log.timestamp).getTime() <= end
    );
  }

  // Gabungkan hasil SQLite + memory, urutkan newest-first, lalu paginasi
  const merged = [...sqliteResult.logs, ...memoryLogs].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const total = merged.length;
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(200, Math.max(1, query.limit ?? 50));
  const startIndex = (page - 1) * limit;
  const paginated = merged.slice(startIndex, startIndex + limit);

  return {
    logs: paginated,
    total,
    page,
    limit,
  };
}
