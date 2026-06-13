import { ActivityLog } from "./types/dashboard.ts";

type LogLevel = "info" | "warn" | "error";

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

const MAX_BUFFER_SIZE = 5000;
const logBuffer: ActivityLog[] = [];

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function log(level: LogLevel, event: string, context: Record<string, unknown>): void {
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

function pushToBuffer(entry: ActivityLog): void {
  if (logBuffer.length >= MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }
  logBuffer.push(entry);
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
  pushToBuffer(entry);
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
  pushToBuffer(entry);
  log("error", "request.failed", {
    ...context,
    error: toErrorMessage(context.error),
  } as Record<string, unknown>);
}

export function getRecentLogs(limit?: number): ActivityLog[] {
  if (limit === undefined || limit <= 0) {
    return logBuffer.slice();
  }
  return logBuffer.slice(-limit);
}

export function getAllLogs(): ActivityLog[] {
  return logBuffer.slice();
}
