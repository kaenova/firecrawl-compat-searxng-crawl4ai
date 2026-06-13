/* ------------------------------------------------------------------
   Firecrawl-compatible request / response types
   ------------------------------------------------------------------ */

export interface SearchRequest {
  query: string;
  page?: number;
  limit?: number;
  country?: string;
  tbs?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface ScrapeRequest {
  url: string;
  formats?: ("markdown" | "html" | "rawHtml" | "screenshot")[];
  waitFor?: number;
  timeout?: number;
  mobile?: boolean;
  headers?: Record<string, string>;
  skipTlsVerification?: boolean;
  onlyMainContent?: boolean;
}

export interface SearchResponse {
  success: true;
  data: {
    web: Array<{
      url: string;
      title: string;
      description: string;
      category?: string;
    }>;
  };
}

export interface ScrapeResponse {
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

export interface ErrorResponse {
  success: false;
  error: string;
}
