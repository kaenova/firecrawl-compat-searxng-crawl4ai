/* ------------------------------------------------------------------
   SearXNG JSON response type
   ------------------------------------------------------------------ */

export interface SearXNGResult {
  url: string;
  title: string;
  content?: string;
  category?: string;
}

export interface SearXNGResponse {
  query: string;
  number_of_results?: number;
  results: SearXNGResult[];
}
