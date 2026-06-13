// Crawl4AI async bridge — submit, poll, and transform

const CRAWL4AI_URL = process.env.CRAWL4AI_URL ?? "http://localhost:11235";

/** Body sent to Crawl4AI POST /crawl */
interface Crawl4aiSubmitBody {
  urls: string[];
  wait_for?: number;
  mobile?: boolean;
  headers?: Record<string, string>;
  skip_tls_verification?: boolean;
  fit_markdown?: boolean;
  screenshot?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Response from Crawl4AI POST /crawl */
interface Crawl4aiSubmitResponse {
  task_id: string;
}

/** Task status as returned by Crawl4AI GET /task/{id} */
interface Crawl4aiTaskResponse {
  task_id: string;
  status: "pending" | "completed" | "failed" | string;
  result?: Crawl4aiResult;
  error?: string;
}

/** Individual result object from a completed Crawl4AI task */
interface Crawl4aiResult {
  markdown?: string;
  html?: string;
  raw_html?: string;
  rawHtml?: string;
  screenshot?: string;
  metadata?: {
    title?: string;
    description?: string;
    source_url?: string;
    sourceURL?: string;
    status_code?: number;
    statusCode?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Firecrawl-compatible scrape response */
interface ScrapeResponse {
  success: true;
  data: {
    markdown?: string;
    html?: string;
    rawHtml?: string;
    screenshot?: string;
    metadata: {
      title?: string;
      description?: string;
      sourceURL?: string;
      statusCode: number;
    };
  };
}

/**
 * Submit a single-URL crawl job to Crawl4AI.
 * Returns the task_id.
 */
export async function submitCrawl(
  url: string,
  options: {
    waitFor?: number;
    mobile?: boolean;
    headers?: Record<string, string>;
    skipTlsVerification?: boolean;
    onlyMainContent?: boolean;
    screenshot?: boolean;
  } = {}
): Promise<{ task_id: string }> {
  const body: Crawl4aiSubmitBody = {
    urls: [url],
  };

  if (options.waitFor !== undefined) body.wait_for = options.waitFor;
  if (options.mobile !== undefined) body.mobile = options.mobile;
  if (options.headers !== undefined) body.headers = options.headers;
  if (options.skipTlsVerification !== undefined)
    body.skip_tls_verification = options.skipTlsVerification;
  if (options.onlyMainContent !== undefined) body.fit_markdown = options.onlyMainContent;
  if (options.screenshot !== undefined) body.screenshot = options.screenshot;

  const res = await fetch(`${CRAWL4AI_URL}/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Crawl4AI submit failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as Crawl4aiSubmitResponse;
  return { task_id: json.task_id };
}

/**
 * Poll a Crawl4AI task until it completes or times out.
 * @returns The completed Crawl4AI result.
 * @throws On timeout or task failure.
 */
export async function pollTask(
  taskId: string,
  maxTimeoutSeconds = 60,
  pollIntervalMs = 1000
): Promise<Crawl4aiResult> {
  const deadline = Date.now() + maxTimeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const res = await fetch(`${CRAWL4AI_URL}/task/${taskId}`);

    if (!res.ok) {
      throw new Error(`Crawl4AI poll failed: ${res.status} ${res.statusText}`);
    }

    const task = (await res.json()) as Crawl4aiTaskResponse;

    if (task.status === "completed") {
      if (!task.result) {
        throw new Error("Crawl4AI task completed but result is missing");
      }
      return task.result;
    }

    if (task.status === "failed") {
      throw new Error(task.error ? `Crawl4AI job failed: ${task.error}` : "Crawl4AI job failed");
    }

    await Bun.sleep(pollIntervalMs);
  }

  throw new Error("Poll timeout");
}

/**
 * Map a Crawl4AI result to the Firecrawl ScrapeResponse shape.
 * Only includes fields requested by `formats`.
 */
export function transformResult(
  crawl4aiResult: Crawl4aiResult,
  formats?: ("markdown" | "html" | "rawHtml" | "screenshot")[]
): ScrapeResponse {
  const requested = new Set(formats ?? ["markdown"]);

  const data: ScrapeResponse["data"] = {
    metadata: {
      title: crawl4aiResult.metadata?.title,
      description: crawl4aiResult.metadata?.description,
      sourceURL:
        crawl4aiResult.metadata?.source_url ?? crawl4aiResult.metadata?.sourceURL,
      statusCode:
        crawl4aiResult.metadata?.status_code ?? crawl4aiResult.metadata?.statusCode ?? 200,
    },
  };

  if (requested.has("markdown")) {
    data.markdown = crawl4aiResult.markdown ?? "";
  }
  if (requested.has("html")) {
    data.html = crawl4aiResult.html ?? "";
  }
  if (requested.has("rawHtml")) {
    data.rawHtml = crawl4aiResult.raw_html ?? crawl4aiResult.rawHtml ?? "";
  }
  if (requested.has("screenshot")) {
    data.screenshot = crawl4aiResult.screenshot ?? "";
  }

  return { success: true, data };
}
