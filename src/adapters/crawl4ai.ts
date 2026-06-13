// Crawl4AI async bridge — submit, poll, and transform

const CRAWL4AI_URL = process.env.CRAWL4AI_URL ?? "http://localhost:11235";
const CRAWL4AI_SUBMIT_PATH = process.env.CRAWL4AI_SUBMIT_PATH ?? "/crawl/job";
const CRAWL4AI_POLL_PATH = process.env.CRAWL4AI_POLL_PATH ?? "/crawl/job";
const CRAWL4AI_DIRECT_PATH = process.env.CRAWL4AI_DIRECT_PATH ?? "/crawl";
const CRAWL4AI_RESULT_PATH = process.env.CRAWL4AI_RESULT_PATH ?? "/crawl/job";

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
): Promise<{ task_id?: string; result?: Crawl4aiResult; completed?: boolean }> {
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

  const paths = [CRAWL4AI_SUBMIT_PATH, CRAWL4AI_DIRECT_PATH];

  let lastError: string | null = null;
  for (const path of paths) {
    const res = await fetch(`${CRAWL4AI_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      lastError = `Crawl4AI submit failed: ${res.status} ${res.statusText}`;
      continue;
    }

    const json = (await res.json()) as Record<string, unknown>;

    if (typeof json.task_id === "string") {
      return { task_id: json.task_id };
    }


    if (json.result && typeof json.result === "object") {
      return { completed: true, result: json.result as Crawl4aiResult };
    }

    if (typeof json.markdown === "string" || typeof json.html === "string" || typeof json.raw_html === "string" || typeof json.rawHtml === "string") {
      return { completed: true, result: json as Crawl4aiResult };
    }

    lastError = "Crawl4AI submit returned an unexpected payload";
  }

  throw new Error(lastError ?? "Crawl4AI submit failed");
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
    const res = await fetch(`${CRAWL4AI_URL}${CRAWL4AI_POLL_PATH}/${taskId}`);

    if (!res.ok) {
      throw new Error(`Crawl4AI poll failed: ${res.status} ${res.statusText}`);
    }

    const task = (await res.json()) as Crawl4aiTaskResponse;

    if (task.status === "completed" || task.status === "success") {
      if (!task.result) {
        const direct = await fetch(`${CRAWL4AI_URL}${CRAWL4AI_RESULT_PATH}/${taskId}`);
        if (!direct.ok) {
          throw new Error("Crawl4AI task completed but result is missing");
        }
        const directTask = (await direct.json()) as Crawl4aiTaskResponse;
        if (!directTask.result) {
          throw new Error("Crawl4AI task completed but result is missing");
        }
        return directTask.result;
      }
      return task.result;
    }

    if (task.status === "processing" || task.status === "running" || task.status === "pending") {
      await Bun.sleep(pollIntervalMs);
      continue;
    }

    if (task.status === "failed" || task.status === "error") {
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
function normalizeJobResult(crawl4aiResult: Crawl4aiResult): Crawl4aiResult {
  // Case 1: Crawl4AI job result shape: { success, results: [ {...} ] }
  const jobResults = Array.isArray((crawl4aiResult as { results?: unknown }).results)
    ? (crawl4aiResult as { results: Crawl4aiResult[] }).results
    : undefined;
  if (jobResults && jobResults.length > 0) {
    const first = jobResults[0];
    return {
      ...first,
      metadata: {
        ...(first.metadata ?? {}),
        ...(crawl4aiResult.metadata ?? {}),
        status_code:
          first.metadata?.status_code ?? first.metadata?.statusCode ?? crawl4aiResult.metadata?.status_code ?? crawl4aiResult.metadata?.statusCode,
      },
    };
  }

  // Case 2: legacy nested result.result shape
  const nested = crawl4aiResult.result;
  if (nested && typeof nested === "object") {
    const nestedResults = Array.isArray((nested as { results?: unknown }).results)
      ? ((nested as { results: Crawl4aiResult[] }).results)
      : [];
    const first = nestedResults[0];
    if (first) {
      return {
        ...first,
        metadata: {
          ...(first.metadata ?? {}),
          ...(crawl4aiResult.metadata ?? {}),
          status_code:
            first.metadata?.status_code ?? first.metadata?.statusCode ?? crawl4aiResult.metadata?.status_code ?? crawl4aiResult.metadata?.statusCode,
        },
      };
    }
  }

  return crawl4aiResult;
}

/**
 * Map a Crawl4AI result to the Firecrawl ScrapeResponse shape.
 * Only includes fields requested by `formats`.
 */
export function transformResult(
  crawl4aiResult: Crawl4aiResult,
  formats?: ("markdown" | "html" | "rawHtml" | "screenshot")[]
): ScrapeResponse {
  console.log("[DEBUG] transformResult input keys:", Object.keys(crawl4aiResult));
  const result = normalizeJobResult(crawl4aiResult);
  console.log("[DEBUG] after normalize keys:", Object.keys(result));
  console.log("[DEBUG] result.markdown type:", typeof result.markdown, "value:", result.markdown);
  console.log("[DEBUG] result.raw_markdown type:", typeof result.raw_markdown, "value length:", result.raw_markdown?.length);
  const requested = new Set(formats ?? ["markdown"]);
  const markdownText =
    result.markdown ??
    result.raw_markdown ??
    result.references_markdown ??
    result.fit_markdown ??
    "";
  const htmlText =
    result.html ??
    result.cleaned_html ??
    result.fit_html ??
    result.raw_html ??
    result.rawHtml ??
    "";
  const rawHtmlText =
    result.raw_html ??
    result.rawHtml ??
    result.html ??
    "";
  const screenshotText = result.screenshot ?? "";

  const data: ScrapeResponse["data"] = {
    metadata: {
      title: result.metadata?.title,
      description: result.metadata?.description,
      sourceURL: result.metadata?.source_url ?? result.metadata?.sourceURL ?? result.url,
      statusCode: result.metadata?.status_code ?? result.metadata?.statusCode ?? 200,
    },
  };

  if (requested.has("markdown")) {
    data.markdown = markdownText;
  }
  if (requested.has("html")) {
    data.html = htmlText;
  }
  if (requested.has("rawHtml")) {
    data.rawHtml = rawHtmlText;
  }
  if (requested.has("screenshot")) {
    data.screenshot = screenshotText;
  }

  return { success: true, data };
}
