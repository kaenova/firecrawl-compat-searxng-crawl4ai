/* ------------------------------------------------------------------
   Crawl4AI REST API types
   ------------------------------------------------------------------ */

export interface Crawl4AISubmitResponse {
  task_id: string;
}

export interface Crawl4AIResult {
  markdown?: string;
  html?: string;
  screenshot?: string;
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
    statusCode?: number;
  };
}

export interface Crawl4AITaskResponse {
  status: "pending" | "completed" | "failed";
  result?: Crawl4AIResult;
  error?: string;
}
