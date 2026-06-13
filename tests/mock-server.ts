/**
 * Mock backend servers for SearXNG and Crawl4AI.
 * Used by both Layer A (SDK) and Layer B (pure HTTP) tests.
 */

export interface MockServer {
  port: number;
  stop(): void;
}

/** Canned SearXNG JSON response */
const SEARXNG_CANNED = {
  query: "test query",
  results: [
    {
      url: "https://example.com/page1",
      title: "Example Page 1",
      content: "This is the first example result.",
      category: "general",
    },
    {
      url: "https://example.com/page2",
      title: "Example Page 2",
      content: "This is the second example result.",
    },
    {
      url: "https://example.com/page3",
      title: "Example Page 3",
      content: "This is the third example result.",
    },
  ],
};

/** Start a mock SearXNG server */
export function startMockSearxng(port = 18080): MockServer {
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (req.method === "GET" && pathname === "/search") {
        const q = url.searchParams.get("q") ?? "";
        const pageno = url.searchParams.get("pageno") ?? "1";
        const language = url.searchParams.get("language") ?? undefined;
        const time_range = url.searchParams.get("time_range") ?? undefined;
        const echoPayload = JSON.stringify({ q, pageno, language, time_range });

        return Response.json({
          query: q,
          results: [
            {
              url: "https://example.com/echo",
              title: "Echo Result",
              content: echoPayload,
              category: "echo",
            },
            ...SEARXNG_CANNED.results.slice(1),
          ],
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  return { port, stop: () => server.stop(true) };
}

/** Task store for Crawl4AI mock */
const crawl4aiTasks = new Map<string, { status: string; result?: unknown; error?: string; pendingUntil?: number }>();
let autoCompleteDelay = 0;

function buildCrawl4aiResult() {
  return {
    markdown: "# Hello World\n\nThis is markdown content.",
    html: "<html><body><h1>Hello World</h1><p>This is HTML content.</p></body></html>",
    raw_html: "<html><body><h1>Hello World</h1><p>This is raw HTML content.</p></body></html>",
    screenshot: "data:image/png;base64,abc123",
    metadata: {
      title: "Hello World Page",
      description: "A test page",
      source_url: "https://example.com",
      status_code: 200,
    },
  };
}

/** Start a mock Crawl4AI server */
export function startMockCrawl4ai(port = 11235): MockServer {
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (req.method === "POST" && pathname === "/crawl/job") {
        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        crawl4aiTasks.set(taskId, {
          status: "pending",
          result: undefined,
          pendingUntil: Date.now() + autoCompleteDelay,
        });
        return Response.json({ task_id: taskId }, { status: 202 });
      }

      if (req.method === "GET" && pathname.startsWith("/crawl/job/")) {
        const taskId = pathname.slice("/crawl/job/".length);
        const task = crawl4aiTasks.get(taskId);

        if (!task) return Response.json({ error: "Task not found" }, { status: 404 });
        if (taskId.startsWith("task-never-")) {
          return Response.json({ task_id: taskId, status: "processing" });
        }
        if (task.status === "pending" && task.pendingUntil && Date.now() < task.pendingUntil) {
          return Response.json({ task_id: taskId, status: "processing" });
        }
        if (task.status === "pending") {
          task.status = "completed";
          task.result = buildCrawl4aiResult();
        }

        return Response.json({
          task_id: taskId,
          status: task.status,
          result: task.result,
          error: task.error,
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  return { port, stop: () => server.stop(true) };
}

export function stopMockServer(server: MockServer): void {
  server.stop();
}

export function resetCrawl4aiTasks(): void {
  crawl4aiTasks.clear();
}

export function setCrawl4aiDelay(ms: number): void {
  autoCompleteDelay = ms;
}

export function createNeverCompletingTask(): string {
  const taskId = `task-never-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  crawl4aiTasks.set(taskId, { status: "pending" });
  return taskId;
}
