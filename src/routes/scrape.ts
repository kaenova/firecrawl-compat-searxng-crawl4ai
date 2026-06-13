import { submitCrawl, pollTask, transformResult } from "../adapters/crawl4ai.ts";
import { logFailure, logRequest } from "../logger.ts";

const DEFAULT_TIMEOUT = Number(process.env.SCRAPE_TIMEOUT ?? "60");
const DEFAULT_POLL_INTERVAL = Number(process.env.POLL_INTERVAL ?? "1000");

interface ScrapeRequestBody {
  url?: string;
  formats?: ("markdown" | "html" | "rawHtml" | "screenshot")[];
  waitFor?: number;
  timeout?: number;
  mobile?: boolean;
  headers?: Record<string, string>;
  skipTlsVerification?: boolean;
  onlyMainContent?: boolean;
}

interface ErrorResponse {
  success: false;
  error: string;
}

export async function handleScrape(req: Request): Promise<Response> {
  const startedAt = Date.now();
  const path = new URL(req.url).pathname;
  let body: ScrapeRequestBody;
  try {
    body = (await req.json()) as ScrapeRequestBody;
  } catch {
    const response = Response.json(
      { success: false, error: "Invalid JSON body" } satisfies ErrorResponse,
      { status: 400 }
    );
    logRequest({ method: req.method, path, status: response.status, durationMs: Date.now() - startedAt });
    return response;
  }

  if (typeof body.url !== "string" || body.url.trim().length === 0) {
    const response = Response.json(
      { success: false, error: "url is required" } satisfies ErrorResponse,
      { status: 400 }
    );
    logRequest({ method: req.method, path, status: response.status, durationMs: Date.now() - startedAt });
    return response;
  }

  const formats = body.formats;
  const waitFor = body.waitFor;
  const timeout = body.timeout ?? DEFAULT_TIMEOUT;
  const mobile = body.mobile;
  const headers = body.headers;
  const skipTlsVerification = body.skipTlsVerification;
  const onlyMainContent = body.onlyMainContent;

  const screenshot =
    Array.isArray(formats) && formats.includes("screenshot");

  try {
    const submitted = await submitCrawl(body.url, {
      waitFor,
      mobile,
      headers,
      skipTlsVerification,
      onlyMainContent,
      screenshot,
    });

    const result = submitted.completed && submitted.result
      ? submitted.result
      : await pollTask(submitted.task_id as string, timeout, DEFAULT_POLL_INTERVAL);
    const response = Response.json(transformResult(result, formats), { status: 200 });
    logRequest({ method: req.method, path, status: response.status, durationMs: Date.now() - startedAt });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("Poll timeout")) {
      const response = Response.json(
        { success: false, error: "Scrape timed out" } satisfies ErrorResponse,
        { status: 504 }
      );
      logFailure({ method: req.method, path, status: response.status, durationMs: Date.now() - startedAt, error: err });
      return response;
    }

    if (message.includes("Crawl4AI submit failed")) {
      const response = Response.json(
        {
          success: false,
          error: "Scrape backend unavailable",
        } satisfies ErrorResponse,
        { status: 502 }
      );
      logFailure({ method: req.method, path, status: response.status, durationMs: Date.now() - startedAt, error: err });
      return response;
    }

    if (message.includes("Crawl4AI job failed")) {
      const response = Response.json(
        { success: false, error: message } satisfies ErrorResponse,
        { status: 502 }
      );
      logFailure({ method: req.method, path, status: response.status, durationMs: Date.now() - startedAt, error: err });
      return response;
    }

    // Catch-all for other backend errors (poll failures, missing result, etc.)
    const response = Response.json(
      { success: false, error: message } satisfies ErrorResponse,
      { status: 502 }
    );
    logFailure({ method: req.method, path, status: response.status, durationMs: Date.now() - startedAt, error: err });
    return response;
  }
}
