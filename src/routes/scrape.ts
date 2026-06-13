import { submitCrawl, pollTask, transformResult } from "../adapters/crawl4ai.ts";

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
  let body: ScrapeRequestBody;
  try {
    body = (await req.json()) as ScrapeRequestBody;
  } catch {
    return Response.json(
      { success: false, error: "Invalid JSON body" } satisfies ErrorResponse,
      { status: 400 }
    );
  }

  if (typeof body.url !== "string" || body.url.trim().length === 0) {
    return Response.json(
      { success: false, error: "url is required" } satisfies ErrorResponse,
      { status: 400 }
    );
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
    const { task_id } = await submitCrawl(body.url, {
      waitFor,
      mobile,
      headers,
      skipTlsVerification,
      onlyMainContent,
      screenshot,
    });

    const result = await pollTask(task_id, timeout, DEFAULT_POLL_INTERVAL);
    const response = transformResult(result, formats);

    return Response.json(response, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes("Poll timeout")) {
      return Response.json(
        { success: false, error: "Scrape timed out" } satisfies ErrorResponse,
        { status: 504 }
      );
    }

    if (message.includes("Crawl4AI submit failed")) {
      return Response.json(
        {
          success: false,
          error: "Scrape backend unavailable",
        } satisfies ErrorResponse,
        { status: 502 }
      );
    }

    if (message.includes("Crawl4AI job failed")) {
      return Response.json(
        { success: false, error: message } satisfies ErrorResponse,
        { status: 502 }
      );
    }

    // Catch-all for other backend errors (poll failures, missing result, etc.)
    return Response.json(
      { success: false, error: message } satisfies ErrorResponse,
      { status: 502 }
    );
  }
}
