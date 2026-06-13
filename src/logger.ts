type LogLevel = "info" | "warn" | "error";

export interface RequestLogContext {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId?: string;
}

export interface ErrorLogContext {
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  requestId?: string;
  error: unknown;
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

export function logRequest(context: RequestLogContext): void {
  log("info", "request.completed", context);
}

export function logFailure(context: ErrorLogContext): void {
  log("error", "request.failed", {
    ...context,
    error: toErrorMessage(context.error),
  });
}
