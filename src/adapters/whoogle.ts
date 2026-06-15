import { config } from "../config.ts";
import type { SearchRequest, SearchResponse, ErrorResponse } from "./searxng.ts";

/* ------------------------------------------------------------------
   Whoogle JSON API types
   ------------------------------------------------------------------ */

interface WhoogleResult {
  href: string;
  text: string;
  title?: string;
}

interface WhoogleSuccessResponse {
  query: string;
  results: WhoogleResult[];
  search_type?: string;
}

interface WhoogleBlockResponse {
  blocked: true;
  error_message: string;
  query: string;
}

interface WhoogleRedirectResponse {
  redirect: string;
}

type WhoogleResponse = WhoogleSuccessResponse | WhoogleBlockResponse | WhoogleRedirectResponse;

/* ------------------------------------------------------------------
   Whoogle search adapter
   ------------------------------------------------------------------ */

function isBlockedResponse(raw: WhoogleResponse): raw is WhoogleBlockResponse {
  return "blocked" in raw && raw.blocked === true;
}

function isRedirectResponse(raw: WhoogleResponse): raw is WhoogleRedirectResponse {
  return "redirect" in raw && typeof raw.redirect === "string";
}

function isSuccessResponse(raw: WhoogleResponse): raw is WhoogleSuccessResponse {
  return "results" in raw && Array.isArray(raw.results);
}

export function parseWhoogleResponse(raw: WhoogleResponse, limit?: number): SearchResponse | ErrorResponse {
  if (isBlockedResponse(raw)) {
    return { success: false, error: raw.error_message || "Whoogle blocked (CAPTCHA)" };
  }

  if (isRedirectResponse(raw)) {
    return { success: false, error: "Whoogle returned a redirect (Feeling Lucky not supported)" };
  }

  if (!isSuccessResponse(raw)) {
    return { success: false, error: "Unexpected Whoogle response format" };
  }

  const results = raw.results ?? [];
  const sliced = limit !== undefined ? results.slice(0, limit) : results;

  const web = sliced.map((r) => ({
    url: r.href ?? "",
    title: r.title ?? r.text?.split("\n")[0] ?? "",
    description: r.text ?? "",
  }));

  return {
    success: true,
    data: { web },
  };
}

export async function searchWhoogle(req: SearchRequest): Promise<SearchResponse | ErrorResponse> {
  const baseUrl = config.WHOOGLE_ENDPOINT;
  if (!baseUrl) {
    return { success: false, error: "Whoogle endpoint not configured" };
  }

  const url = new URL("/search", baseUrl);
  url.searchParams.set("q", req.query);
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
    });

    if (res.status === 303) {
      const raw = (await res.json().catch(() => ({}))) as WhoogleResponse;
      return parseWhoogleResponse(raw, req.limit);
    }

    if (!res.ok) {
      const raw = (await res.json().catch(() => ({}))) as WhoogleResponse;
      if (isBlockedResponse(raw)) {
        return parseWhoogleResponse(raw, req.limit);
      }
      return { success: false, error: `Whoogle returned HTTP ${res.status}` };
    }

    const raw = (await res.json()) as WhoogleResponse;
    return parseWhoogleResponse(raw, req.limit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Whoogle request failed";
    return { success: false, error: message };
  }
}
