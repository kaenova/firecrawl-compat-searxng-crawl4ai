export interface SearchRequest {
  query: string;
  page?: number;
  limit?: number;
  country?: string;
  tbs?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
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

export interface ErrorResponse {
  success: false;
  error: string;
}

interface SearxngResult {
  url?: string;
  title?: string;
  content?: string;
  category?: string;
}

interface SearxngResponse {
  results?: SearxngResult[];
}

const COUNTRY_TO_LANGUAGE: Record<string, string> = {
  us: "en",
  id: "id",
  gb: "en",
  ca: "en",
  au: "en",
  fr: "fr",
  de: "de",
  es: "es",
  it: "it",
  pt: "pt",
  nl: "nl",
  ru: "ru",
  jp: "ja",
  kr: "ko",
  cn: "zh",
  tw: "zh",
  in: "hi",
  br: "pt",
  mx: "es",
  tr: "tr",
  sa: "ar",
  pl: "pl",
  se: "sv",
  no: "no",
  dk: "da",
  fi: "fi",
};

const TBS_TO_TIME_RANGE: Record<string, string> = {
  "qdr:h": "day",
  "qdr:d": "day",
  "qdr:w": "week",
  "qdr:m": "month",
  "qdr:y": "year",
};

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}

export function buildSearxngUrl(baseUrl: string, req: SearchRequest): string {
  let q = req.query;

  if (req.includeDomains && req.includeDomains.length > 0) {
    const sites = req.includeDomains.map((d) => `site:${d}`).join(" OR ");
    q += ` ${sites}`;
  }

  if (req.excludeDomains && req.excludeDomains.length > 0) {
    const sites = req.excludeDomains.map((d) => `-site:${d}`).join(" ");
    q += ` ${sites}`;
  }

  const params: Record<string, string | number | undefined> = {
    format: "json",
    q,
    pageno: req.page ?? 1,
    categories: "general",
  };

  if (req.country) {
    const lang = COUNTRY_TO_LANGUAGE[req.country.toLowerCase()] ?? req.country;
    params.language = lang;
  }

  if (req.tbs) {
    const timeRange = TBS_TO_TIME_RANGE[req.tbs];
    if (timeRange) {
      params.time_range = timeRange;
    }
  }

  return `${baseUrl}/search?${buildQueryString(params)}`;
}

export function parseSearxngResponse(raw: SearxngResponse, limit?: number): SearchResponse {
  const results = raw.results ?? [];
  const sliced = limit !== undefined ? results.slice(0, limit) : results;

  const web = sliced.map((r) => ({
    url: r.url ?? "",
    title: r.title ?? "",
    description: r.content ?? "",
    category: r.category,
  }));

  return {
    success: true,
    data: { web },
  };
}

export async function searchSearxng(req: SearchRequest): Promise<SearchResponse | ErrorResponse> {
  const baseUrl = process.env.SEARXNG_URL;
  if (!baseUrl) {
    return { success: false, error: "Search backend unavailable" };
  }

  const url = buildSearxngUrl(baseUrl, req);

  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      return { success: false, error: "Search backend unavailable" };
    }
    const raw = (await res.json()) as SearxngResponse;
    return parseSearxngResponse(raw, req.limit);
  } catch {
    return { success: false, error: "Search backend unavailable" };
  }
}
