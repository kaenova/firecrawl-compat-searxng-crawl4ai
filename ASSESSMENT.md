# Firecrawl → Crawl4AI + SearXNG Proxy — Feasibility Assessment

## Goal

Build a Bun HTTP proxy that exposes **Firecrawl-compatible** `/v2/search` and `/v2/scrape` endpoints, backed by **SearXNG** (search) and **Crawl4AI** (scrape), both self-hosted.

---

## 1. Endpoint Mapping

### 1.1 POST /v2/search — Firecrawl Search → SearXNG

| Firecrawl Param | SearXNG Param | Compatible? |
|---|---|---|
| `query` (required) | `q` (required) | ✅ Direct passthrough |
| `limit` | Not natively supported; SearXNG returns ~20/page. We truncate client-side. | ⚠️ Proxy-side truncation |
| `page` | `pageno` | ✅ Direct map |
| `country` / `location` | `language` (language code only, NOT geo) | ⚠️ Partial — map country→language, no true geo-targeting |
| `tbs` (qdr:h/d/w/m/y) | `time_range` (day/month/year) | ⚠️ Partial — only day/month/year granularity |
| `categories` | `categories` | ⚠️ Different catalog. Map: `github`→`repos`, `research`→`science`, `pdf`→`files` |
| `includeDomains` | SearXNG forwards `site:` syntax to engines | ⚠️ Transform to `site:domainA OR site:domainB` in query |
| `excludeDomains` | SearXNG forwards `-site:` syntax | ⚠️ Transform to `-site:domainA -site:domainB` in query |
| `scrapeOptions.formats` | N/A (search-only) | ❌ Would need to call Crawl4AI per result (expensive, async) |

**Response mapping — SearXNG → Firecrawl:**

```
SearXNG:                              Firecrawl:
{                                     {
  "results": [{                         "success": true,
    "url": "...",                       "data": {
    "title": "...",                       "web": [{
    "content": "...",  ──────────>         "url": "...",
    "publishedDate": "...",                "title": "...",
    "engine": "...",                       "description": "...",
    "engines": [...],                      "category": "..."
    "category": "...",                   }]
    "score": ...                        }
  }]                                  }
}
```

**Verdict: ✅ VIABLE** — core search works directly. `scrapeOptions` (auto-scraping each result) can be implemented as a second pass through Crawl4AI if requested, but adds latency. Domain filters, time range, and categories all map with reasonable fidelity.

---

### 1.2 POST /v2/scrape — Firecrawl Scrape → Crawl4AI

| Firecrawl Param | Crawl4AI Capability | Compatible? |
|---|---|---|
| `url` (required) | `urls` array | ✅ Direct passthrough |
| `formats: [markdown]` | Crawl4AI outputs markdown natively | ✅ Core feature |
| `formats: [html]` | Crawl4AI can return raw HTML | ✅ `raw:` protocol or `result.html` |
| `formats: [rawHtml]` | Same as HTML | ✅ |
| `formats: [screenshot]` | Built-in screenshot support | ✅ |
| `onlyMainContent` | `fit_markdown` heuristic | ⚠️ Different algorithm but similar outcome |
| `onlyCleanContent` | No direct equivalent | ❌ Not available in self-hosted Crawl4AI |
| `waitFor` | JS execution + wait | ✅ Supported |
| `mobile` | Emulation possible | ✅ |
| `timeout` | Configurable | ✅ |
| `headers` | Custom headers supported | ✅ |
| `skipTlsVerification` | Probably | ✅ (client-side config) |
| `extract` (LLM schema) | Crawl4AI has LLM extraction | ✅ If `.llm.env` configured |
| `maxAge`/`minAge` (caching) | No built-in caching API | ❌ Must implement proxy-side cache |
| `actions` (pre-scrape) | JS execution, clicks | ⚠️ Crawl4AI supports JS but not structured action sequences like Firecrawl |

**Crawl4AI REST API workflow:**
```
POST /crawl  {"urls": ["https://..."], ...options}  →  {"task_id": "..."}
GET  /task/{task_id}  →  {status: "completed", result: {markdown, html, metadata, ...}}
```

The API is **async** (submit job → poll status → get result), unlike Firecrawl which returns synchronously. The proxy must:
1. Submit crawl job to Crawl4AI
2. Poll `/task/{task_id}` until complete
3. Transform result to Firecrawl response format

**Response mapping — Crawl4AI → Firecrawl:**

```
Crawl4AI result:                      Firecrawl:
{                                     {
  "markdown": "...",                    "success": true,
  "html": "...",                        "data": {
  "metadata": {                           "markdown": "...",
    "title": "...",                       "html": "...",
    "description": "..."                  "rawHtml": "...",
  }                                       "metadata": {
}                                           "title": "...",
                                            "description": "...",
                                            "sourceURL": "...",
                                            "statusCode": 200
                                          }
                                        }
                                      }
```

**Verdict: ✅ VIABLE** — core scraping maps cleanly. Main gap: Crawl4AI is async, Firecrawl is sync. The proxy must implement polling with timeout. Caching and `onlyCleanContent` need proxy-side implementation.

---

## 2. Architecture

```
Client (Firecrawl SDK / cURL)
        │
        ▼
┌─────────────────────────────────────┐
│  firecrawl-to-crawl4ai-proxy        │
│  (Bun HTTP server, port :3002)      │
│                                     │
│  POST /v2/search  ──► SearXNG      │
│  POST /v2/scrape  ──► Crawl4AI     │
│                                     │
│  • Request mapping                  │
│  • Response normalization           │
│  • Optional caching layer           │
│  • Async→Sync bridge (polling)      │
└─────────────────────────────────────┘
        │                    │
        ▼                    ▼
┌──────────────┐    ┌──────────────────┐
│  SearXNG      │    │  Crawl4AI         │
│  :8080        │    │  :11235           │
│  (search)     │    │  (scrape)         │
└──────────────┘    └──────────────────┘
```

## 3. Gaps & Limitations

| Gap | Severity | Mitigation |
|---|---|---|
| Crawl4AI async-only API | Medium | Implement polling with configurable timeout (default 60s) |
| No `onlyCleanContent` in Crawl4AI | Low | Skip or implement with optional LLM pass |
| SearXNG geo-targeting is language-only, not true geo | Low | Acceptable for most use cases |
| `scrapeOptions` in search ends up calling Crawl4AI per result | Medium | Implement as opt-in; default to metadata-only |
| No caching in Crawl4AI | Low | Implement in-memory or Redis cache in proxy |
| Firecrawl `actions` parameter (structured pre-scrape) | Medium | Simplify to JS execution + wait only |
| SearXNG max ~20 results per page | Low | Accept; Firecrawl `limit` is a soft cap anyway |
| SearXNG JSON must be enabled in settings.yml | Setup | Document requirement for self-hosted instance |
| Crawl4AI needs `.llm.env` for LLM extraction | Setup | Document; extraction works without it for basic scrape |
| No Firecrawl auth passthrough | Low | Implement optional API key validation in proxy |

## 4. Recommended Implementation Order

1. **Phase 1: Core proxy skeleton** — Bun server, env config, health check
2. **Phase 2: /v2/scrape** — Map to Crawl4AI with async polling, basic markdown/HTML
3. **Phase 3: /v2/search** — Map to SearXNG, response normalization
4. **Phase 4: Advanced features** — Caching, `scrapeOptions` in search, time/category mapping
5. **Phase 5: Hardening** — Error handling, rate limiting, auth passthrough

## 5. Conclusion

**This project is feasible with reasonable effort.** The core value proposition — exposing SearXNG + Crawl4AI behind a Firecrawl-compatible API — maps cleanly for ~80% of parameters. The main engineering work is:

- Async→sync bridge for Crawl4AI (polling pattern)
- Response format normalization (SearXNG JSON → Firecrawl JSON, Crawl4AI result → Firecrawl JSON)
- Parameter translation (especially domain filters, time range, categories)
- Optional caching layer

Estimated effort: **3-5 days** for a working MVP covering search + scrape with markdown.
