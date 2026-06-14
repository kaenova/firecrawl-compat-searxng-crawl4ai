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
      title?: string | string[];
      description?: string | string[];
      sourceURL?: string;
      url?: string;
      language?: string | string[] | null;
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
 * Coerce any Crawl4AI value into a plain string.
 * Crawl4AI occasionally returns structured markdown/html objects
 * (e.g. { raw_markdown: "...", fit_html: "" }) instead of plain strings.
 * Firecrawl spec requires data.markdown / data.html to be strings.
 */
function coerceString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  // Crawl4AI structured markdown object — extract the richest text field
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidates = [
      obj.markdown,
      obj.raw_markdown,
      obj.references_markdown,
      obj.fit_markdown,
      obj.html,
      obj.cleaned_html,
      obj.raw_html,
      obj.rawHtml,
      obj.fit_html,
      obj.screenshot,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.length > 0) return c;
    }
    // Fallback: stringify if nothing found
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }

  return "";
}

/**
 * Extract a string from Crawl4AI result trying multiple field names.
 */
function pickString(result: Crawl4aiResult, ...keys: string[]): string {
  for (const key of keys) {
    const val = (result as Record<string, unknown>)[key];
    if (val !== undefined && val !== null) return coerceString(val);
  }
  return "";
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
    const first = jobResults[0]!;
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
    const first = nestedResults[0]!;
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
  const result = normalizeJobResult(crawl4aiResult);
  const requested = new Set(formats ?? ["markdown"]);

  const markdownText = pickString(result, "markdown", "raw_markdown", "references_markdown", "fit_markdown");
  const htmlText = pickString(result, "html", "cleaned_html", "fit_html", "raw_html", "rawHtml");
  const rawHtmlText = pickString(result, "raw_html", "rawHtml", "html");
  const screenshotText = pickString(result, "screenshot");

  const data: ScrapeResponse["data"] = {
    metadata: {
      title: result.metadata?.title ?? undefined,
      description: result.metadata?.description ?? undefined,
      sourceURL: coerceString(result.metadata?.source_url ?? result.metadata?.sourceURL ?? result.url),
      url: result.url ? coerceString(result.url) : undefined,
      language: result.metadata?.language ?? undefined,
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
