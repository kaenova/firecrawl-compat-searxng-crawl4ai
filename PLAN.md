# PLAN — Whoogle Search Backend Integration

> Add Whoogle as an additional search backend alongside SearXNG.
> Whoogle is queried first by default (`SEARCH_PRIORITY=whoogle,searxng`), with automatic fallback on failure.
> Scope: `src/config.ts`, `src/adapters/whoogle.ts`, `src/routes/search.ts`, env files.

---

## 1. Environment Configuration

### 1.1 New Env Vars

| Variable | Description | Required | Default |
| -------- | ----------- | -------- | ------- |
| `WHOOGLE_ENDPOINT` | Base URL of Whoogle instance (e.g. `https://whoogle.kaenova.my.id`) | No* | — |
| `SEARCH_PRIORITY` | Comma-ordered fallback list: `whoogle,searxng` or `searxng,whoogle` | No | `whoogle,searxng` |

*If `SEARCH_PRIORITY` includes `whoogle`, then `WHOOGLE_ENDPOINT` becomes required.

### 1.2 `.env.example` Update

```env
SEARXNG_URL=http://localhost:8080
CRAWL4AI_URL=http://localhost:11235
PORT=3002
SCRAPE_TIMEOUT=60
POLL_INTERVAL=1000
WHOOGLE_ENDPOINT=https://whoogle.kaenova.my.id
SEARCH_PRIORITY=whoogle,searxng
# FIRECRAWL_API_KEY=optional-key
```

### 1.3 `docker-compose.yml` Update

Add `WHOOGLE_ENDPOINT` and `SEARCH_PRIORITY` to the proxy service `environment:` block.

---

## 2. Whoogle Adapter (`src/adapters/whoogle.ts`)

### 2.1 API Contract (validated against live endpoint)

**Request:**
```
GET {WHOOGLE_ENDPOINT}/search?q={query}&format=json
Accept: application/json   (optional; ?format=json is sufficient)
```

**Response shape (success, HTTP 200):**
```json
{
  "query": "hello world",
  "results": [
    {
      "href": "https://example.com/page",
      "text": "Page title and snippet combined...",
      "title": "Page Title"
    }
  ],
  "search_type": ""
}
```

**Special cases:**
- Feeling Lucky → HTTP 303 with `{ "redirect": "<url>" }` — treated as error (no direct redirect support in Firecrawl proxy).
- CAPTCHA/block → HTTP 503 with `{ "blocked": true, "error_message": "...", "query": "..." }` — treated as error to trigger fallback.

### 2.2 Parameter Mapping

| Firecrawl param | Whoogle support | Mapping |
| ----------------- | --------------- | ------- |
| `query` | ✅ | forwarded as `q` |
| `limit` | ❌ | applied client-side via `.slice(0, limit)` |
| `page` | ❌ | ignored |
| `country` | ❌ | ignored |
| `tbs` | ❌ | ignored |
| `includeDomains` | ❌ | ignored |
| `excludeDomains` | ❌ | ignored |

### 2.3 Adapter Interface

Reuse existing `SearchRequest`, `SearchResponse`, `ErrorResponse` from `src/adapters/searxng.ts` (or a shared types file). Adapter exports:

```ts
export async function searchWhoogle(req: SearchRequest): Promise<SearchResponse | ErrorResponse>
```

---

## 3. Search Router Update (`src/routes/search.ts`)

### 3.1 Fallback Logic

1. Parse `SEARCH_PRIORITY` into ordered array (e.g. `["whoogle", "searxng"]`).
2. For each backend in order:
   - If backend is `whoogle` and `WHOOGLE_ENDPOINT` is set → call `searchWhoogle()`.
   - If backend is `searxng` and `SEARXNG_URL` is set → call `searchSearxng()`.
   - If result `success === true` → return immediately.
   - If result `success === false` → continue to next backend (fallback).
3. If all backends fail → return 502 with last error message (or combined error).

### 3.2 Validation

- If `SEARCH_PRIORITY` lists a backend whose env var is missing, skip it with a console warning.
- If no backends are configured → return 502 `{ success: false, error: "No search backends configured" }`.

---

## 4. File Targets

| File | Change |
| ---- | ------ |
| `src/config.ts` | Add `WHOOGLE_ENDPOINT` (optional string) and `SEARCH_PRIORITY` (default `"whoogle,searxng"`) |
| `src/adapters/whoogle.ts` | **New** — Whoogle JSON API client + response parser |
| `src/routes/search.ts` | Replace single `searchSearxng` call with priority-based fallback loop |
| `.env.example` | Add `WHOOGLE_ENDPOINT` and `SEARCH_PRIORITY` lines |
| `docker-compose.yml` | Inject new env vars into proxy service |

---

## 5. Verification Checklist

- [ ] `curl https://whoogle.kaenova.my.id/search?q=hello&format=json` returns valid JSON
- [ ] Proxy starts with `SEARCH_PRIORITY=whoogle,searxng` and `WHOOGLE_ENDPOINT` set → search hits Whoogle
- [ ] Whoogle failure (simulate by breaking URL) → falls back to SearXNG
- [ ] `SEARCH_PRIORITY=searxng,whoogle` → SearXNG is queried first
- [ ] `SEARCH_PRIORITY=searxng` only → Whoogle is never queried
- [ ] Missing `WHOOGLE_ENDPOINT` with `SEARCH_PRIORITY=whoogle,searxng` → Whoogle skipped, SearXNG used
- [ ] All existing `/v2/search` tests still pass
