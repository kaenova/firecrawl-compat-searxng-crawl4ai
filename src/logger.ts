import type { ActivityLog } from "./types/dashboard.ts";
import { insertActivityLog } from "./stores/sqlite-activity-store.ts";
import { isHighPriorityPath } from "./stores/activity-paths.ts";

export interface RequestLogContext {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId?: string;
  requestBody?: string;
  responseBody?: string;
}

export interface ErrorLogContext {
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  requestId?: string;
  error: unknown;
  requestBody?: string;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function log(level: "info" | "warn" | "error", event: string, context: Record<string, unknown>): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function persistIfHighPriority(entry: ActivityLog, method: string, path: string): void {
  if (!isHighPriorityPath(method, path)) return;
  try {
    insertActivityLog(entry);
  } catch {
    // Jangan biarkan kegagalan SQLite mengganggu logging
  }
}

export function logRequest(context: RequestLogContext): void {
  const entry: ActivityLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    method: context.method,
    path: context.path,
    status: context.status,
    durationMs: context.durationMs,
    requestBody: context.requestBody,
    responseBody: context.responseBody,
  };
  persistIfHighPriority(entry, context.method, context.path);
  log("info", "request.completed", context as Record<string, unknown>);
}

export function logFailure(context: ErrorLogContext): void {
  const entry: ActivityLog = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    method: context.method,
    path: context.path,
    status: context.status ?? 500,
    durationMs: context.durationMs ?? 0,
    error: toErrorMessage(context.error),
    requestBody: context.requestBody,
  };
  persistIfHighPriority(entry, context.method, context.path);
  log("error", "request.failed", {
    ...context,
    error: toErrorMessage(context.error),
  } as Record<string, unknown>);
}

export function getRecentLogs(_limit?: number): ActivityLog[] {
  return [];
}

export function getAllLogs(): ActivityLog[] {
  return [];
}
