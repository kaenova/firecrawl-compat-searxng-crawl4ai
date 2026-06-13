# PLAN — firecrawl-searxng-crawl4ai-proxy

> Firecrawl-compatible `/v2/search` and `/v2/scrape` proxy backed by SearXNG + Crawl4AI.
> Runtime: **Bun** + **TypeScript**. Test runner: **Bun test** (built-in).

---

## 1. Environment Configuration

### 1.1 Required Env Vars

| Variable          | Description                          | Required | Example                      |
| ----------------- | ------------------------------------ | -------- | ---------------------------- |
| `SEARXNG_URL`     | Base URL of SearXNG instance (JSON)  | Yes      | `http://localhost:8080`      |
| `CRAWL4AI_URL`    | Base URL of Crawl4AI REST API        | Yes      | `http://localhost:11235`     |
| `PORT`            | Proxy listen port                    | No       | `3002` (default)             |
| `SCRAPE_TIMEOUT`  | Max seconds to poll Crawl4AI job     | No       | `60` (default)               |
| `POLL_INTERVAL`   | Interval (ms) between poll attempts  | No       | `1000` (default)             |
| `FIRECRAWL_API_KEY` | Optional auth key (if set, validates incoming `Authorization: Bearer <key>`) | No | — |

### 1.2 Env Loading

Use `process.env` — no extra library. For local dev, provide a `.env.example` file. In Docker Compose, inject directly via `environment:`.

### 1.3 `.env.example`

```env
SEARXNG_URL=http://localhost:8080
CRAWL4AI_URL=http://localhost:11235
PORT=3002
SCRAPE_TIMEOUT=60
POLL_INTERVAL=1000
# FIRECRAWL_API_KEY=optional-key
```

---

## 2. Test Harness

### 2.1 Test Framework

**Bun's built-in test runner** (`bun test`).

Why:
- Already using Bun runtime; zero additional install.
- Native TypeScript support.
- Fast, Jest-compatible `describe`/`it`/`expect` API.
- Built-in mocking via `mock.module()`.

### 2.2 Test Layers — Two Approaches

Testing runs at **two levels** to ensure the proxy is truly Firecrawl-compatible:

| Layer | Approach | Tool | Purpose |
| ----- | -------- | ---- | ------- |
| **A — SDK Integration** | Import `firecrawl` npm package, point at proxy | `app.search()` / `app.scrape()` | Verifies real-world SDK compatibility — the proxy must behave exactly like the real Firecrawl API |
| **B — Pure HTTP** | Direct `fetch()` calls to proxy endpoints | Raw JSON request/response | Covers edge cases, error codes, malformed payloads, structure validation |

Why both:
- Layer A proves the proxy works with the **actual Firecrawl SDK** — the whole point of the project.
- Layer B tests behavior the SDK might abstract away (error bodies, HTTP status codes, request validation).

**Dev dependency:**
```bash
bun add -d firecrawl
```

### 2.3 Test Scope

**Only two endpoints are tested:**

| Endpoint          | Covered | Notes                                     |
| ----------------- | ------- | ----------------------------------------- |
| `POST /v2/search` | ✅      | SDK `app.search()` + raw HTTP             |
| `POST /v2/scrape` | ✅      | SDK `app.scrape()` + raw HTTP             |
| `POST /v2/crawl`  | ❌      | Returns 404                               |
| `POST /v2/map`    | ❌      | Returns 404                               |
| `GET  /v2/health` | ✅      | Liveness check (simple)                   |
| All other paths   | ❌      | Returns 404 — tested implicitly           |

### 2.4 Test File Structure

```
tests/
  sdk/
    search.sdk.test.ts   — SDK-based search tests (app.search)
    scrape.sdk.test.ts   — SDK-based scrape tests (app.scrape)
  api/
    search.test.ts       — raw HTTP search tests
    scrape.test.ts       — raw HTTP scrape tests
    health.test.ts       — health check test
    not-found.test.ts    — 404 for unexposed endpoints
```

### 2.5 How SDK Tests Work (Layer A)

```ts
// tests/sdk/search.sdk.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import FirecrawlApp from "firecrawl";

const PROXY_URL = "http://localhost:3002";

let app: FirecrawlApp;

beforeAll(() => {
  app = new FirecrawlApp({
    apiKey: "test-key",       // ignored by proxy unless FIRECRAWL_API_KEY is set
    apiUrl: PROXY_URL,        // ← point at our proxy, NOT firecrawl.dev
  });
});
```

**Key detail:** The Firecrawl SDK allows overriding `apiUrl`. We set it to `http://localhost:3002` so all SDK calls hit our proxy. The proxy then relays to SearXNG / Crawl4AI (mocked in test).

```ts
// Example SDK-based search test
it("search returns Firecrawl-shaped response", async () => {
  const result = await app.search("test query");
  expect(result.success).toBe(true);
  expect(Array.isArray(result.data?.web)).toBe(true);
});
```

```ts
// Example SDK-based scrape test
it("scrape returns markdown content", async () => {
  const result = await app.scrape("https://example.com", {
    formats: ["markdown"],
  });
  expect(result.success).toBe(true);
  expect(typeof result.data?.markdown).toBe("string");
});
```

### 2.6 How Pure API Tests Work (Layer B)

Same mock server backing both layers. Pure API tests call `fetch()` directly:

```ts
// tests/api/search.test.ts
it("returns 400 when query is missing", async () => {
  const res = await fetch("http://localhost:3002/v2/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.success).toBe(false);
});
```

### 2.7 Mock Strategy

All tests mock **outbound HTTP calls** to SearXNG and Crawl4AI by starting an **in-process mock server** that returns pre-canned JSON responses.

The **same mock server** backs both Layer A (SDK) and Layer B (pure HTTP) — no duplication:

- `POST /search` → canned SearXNG JSON
- `POST /crawl` + `GET /task/:id` → canned Crawl4AI JSON

That way:
- Tests run without real SearXNG / Crawl4AI.
- We can simulate success, failure, timeout, malformed responses.
- Both SDK and pure API tests share identical backend simulation.

### 2.8 What the Tests Verify

**`/v2/search` — SDK (Layer A)**
- ✅ `app.search("query")` returns `{ success: true, data: { web: [...] } }`
- ✅ `app.search("query", { limit: 5 })` returns at most 5 results
- ✅ `app.search("query", { country: "us" })` maps to SearXNG `language=en`
- ✅ `app.search("query", { tbs: "qdr:w" })` maps to SearXNG `time_range=week`

**`/v2/search` — Pure HTTP (Layer B)**
- ✅ 200 with correct Firecrawl-shaped response given normal SearXNG JSON
- ✅ `query` forwarded to SearXNG as `q`
- ✅ `includeDomains` / `excludeDomains` transformed into `site:` / `-site:` query syntax
- ✅ `page` maps to SearXNG `pageno`
- ✅ 502 when SearXNG is unreachable
- ✅ 400 when `query` is missing

**`/v2/scrape` — SDK (Layer A)**
- ✅ `app.scrape("https://example.com")` returns `{ success: true, data: { markdown, metadata } }`
- ✅ `app.scrape(url, { formats: ["markdown"] })` includes `markdown` field
- ✅ `app.scrape(url, { formats: ["html"] })` includes `html` field
- ✅ `app.scrape(url, { waitFor: 2000 })` forwards to Crawl4AI

**`/v2/scrape` — Pure HTTP (Layer B)**
- ✅ 200 with correct Firecrawl-shaped response given completed Crawl4AI job
- ✅ Submits crawl job to Crawl4AI, polls until `completed`, returns result
- ✅ `formats: ["screenshot"]` returns `screenshot` field
- ✅ `timeout` controls max poll time; returns 504 on timeout
- ✅ 502 when Crawl4AI is unreachable
- ✅ 400 when `url` is missing

**`GET /v2/health`**
- ✅ Returns `{ status: "ok" }` with 200

**Untested (not-found)**
- ✅ Any other path returns 404 with `{ success: false, error: "Not found" }`

### 2.9 Run Command

```bash
bun test
```

Add to `package.json`:
```json
"scripts": {
  "test": "bun test",
  "dev": "bun run --watch src/index.ts",
  "start": "bun run src/index.ts"
}
```

---

## 3. Core Implementation

### 3.1 Project Structure

```
src/
  index.ts          — entrypoint: HTTP server, route table
  config.ts         — env var loading + defaults
  routes/
    search.ts       — POST /v2/search handler
    scrape.ts       — POST /v2/scrape handler
    health.ts       — GET  /v2/health handler
  adapters/
    searxng.ts      — SearXNG request builder + response parser
    crawl4ai.ts     — Crawl4AI submit + poll + response parser
  types/
    firecrawl.ts    — Firecrawl request/response type definitions
    searxng.ts      — SearXNG JSON response type
    crawl4ai.ts     — Crawl4AI REST types
tests/
  search.test.ts
  scrape.test.ts
  health.test.ts
  not-found.test.ts
```

### 3.2 Server (src/index.ts)

- Bun.serve on `PORT` (default 3002).
- JSON body parsing via `await req.json()`.
- Route matching:
  - `GET  /v2/health` → health handler
  - `POST /v2/search` → search handler
  - `POST /v2/scrape` → scrape handler
  - Everything else → `{ success: false, error: "Not found" }` (404)
- Optional auth check (if `FIRECRAWL_API_KEY` is set, validate `Authorization: Bearer <key>` header).

### 3.3 POST /v2/search → SearXNG

**Request mapping (Firecrawl → SearXNG):**

| Firecrawl        | SearXNG                  | Transformation                                  |
| ---------------- | ------------------------ | ----------------------------------------------- |
| `query`          | `q`                      | Direct passthrough                              |
| `page`           | `pageno`                 | Direct passthrough                              |
| `limit`          | —                        | Client-side `.slice(0, limit)` on results       |
| `country`        | `language`               | Map country code to language code (e.g., `us`→`en`, `id`→`id`) |
| `tbs`            | `time_range`             | `qdr:h`→`day`, `qdr:d`→`day`, `qdr:w`→`week`, `qdr:m`→`month`, `qdr:y`→`year` |
| `includeDomains` | (appended to `q`)        | Transform to `site:domainA OR site:domainB` appended to query |
| `excludeDomains` | (appended to `q`)        | Transform to `-site:domainA -site:domainB` appended to query |

**SearXNG API call:**
```
GET {SEARXNG_URL}/search?format=json&q={query}&pageno={page}&language={lang}&time_range={range}&categories=general
```

**Response mapping (SearXNG → Firecrawl):**
```json
{
  "success": true,
  "data": {
    "web": [{
      "url": "string",
      "title": "string",
      "description": "string",
      "category": "string"
    }]
  }
}
```

**Error cases:**
- SearXNG unreachable → 502 `{ success: false, error: "Search backend unavailable" }`
- Empty query → 400 `{ success: false, error: "query is required" }`

### 3.4 POST /v2/scrape → Crawl4AI

**Crawl4AI workflow (async → sync bridge):**

```
1. POST {CRAWL4AI_URL}/crawl  { urls: [url], ...options }  →  { task_id }
2. Poll GET {CRAWL4AI_URL}/task/{task_id}  every POLL_INTERVAL ms
3. On status="completed": transform result → Firecrawl response
4. On timeout (SCRAPE_TIMEOUT seconds): return 504
```

**Request mapping (Firecrawl → Crawl4AI):**

| Firecrawl       | Crawl4AI Parameter          | Transformation                          |
| --------------- | --------------------------- | --------------------------------------- |
| `url`           | `urls`                      | Wrap in array `[url]`                   |
| `formats`       | (post-process)              | `markdown`→include, `html`→include, `screenshot`→`screenshot: true` |
| `waitFor`       | `wait_for`                  | Direct passthrough (ms)                 |
| `timeout`       | (proxy-side poll timeout)   | Controls max poll duration              |
| `mobile`        | `mobile`                    | Direct passthrough                      |
| `headers`       | `headers`                   | Direct passthrough                      |
| `skipTlsVerification` | `skip_tls_verification` | Direct passthrough                      |
| `onlyMainContent` | `fit_markdown`            | Direct passthrough                      |

**Response mapping (Crawl4AI result → Firecrawl):**
```json
{
  "success": true,
  "data": {
    "markdown": "string",
    "html": "string",
    "rawHtml": "string",
    "screenshot": "string (base64 or URL)",
    "metadata": {
      "title": "string",
      "description": "string",
      "sourceURL": "string",
      "statusCode": 200
    }
  }
}
```

**Error cases:**
- Crawl4AI unreachable → 502 `{ success: false, error: "Scrape backend unavailable" }`
- Missing `url` → 400 `{ success: false, error: "url is required" }`
- Poll timeout → 504 `{ success: false, error: "Scrape timed out" }`
- Crawl4AI job failed → 502 `{ success: false, error: "Scrape failed: <reason>" }`

### 3.5 TypeScript Types (src/types/)

**Firecrawl request types:**
```ts
interface SearchRequest {
  query: string;
  page?: number;
  limit?: number;
  country?: string;
  tbs?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
}

interface ScrapeRequest {
  url: string;
  formats?: ("markdown" | "html" | "rawHtml" | "screenshot")[];
  waitFor?: number;
  timeout?: number;
  mobile?: boolean;
  headers?: Record<string, string>;
  skipTlsVerification?: boolean;
  onlyMainContent?: boolean;
}
```

**Firecrawl response types:**
```ts
interface SearchResponse {
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

interface ErrorResponse {
  success: false;
  error: string;
}
```

---

## 4. Docker and Deployment

### 4.1 Dockerfile

Multi-stage build using `oven/bun`:

```dockerfile
# ---- Build stage ----
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY src/ ./src/
COPY tsconfig.json ./

# ---- Run stage ----
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

ENV PORT=3002
EXPOSE 3002

CMD ["bun", "run", "src/index.ts"]
```

### 4.2 Docker Compose (dev convenience)

```yaml
# docker-compose.yml
services:
  proxy:
    build: .
    ports:
      - "3002:3002"
    environment:
      SEARXNG_URL: http://searxng:8080
      CRAWL4AI_URL: http://crawl4ai:11235
      SCRAPE_TIMEOUT: 60
      POLL_INTERVAL: 1000
    depends_on:
      - searxng
      - crawl4ai

  searxng:
    image: searxng/searxng:latest
    ports:
      - "8080:8080"
    environment:
      - SEARXNG_BASE_URL=http://localhost:8080/
    volumes:
      - ./searxng/settings.yml:/etc/searxng/settings.yml:ro

  crawl4ai:
    image: unclecode/crawl4ai:latest
    ports:
      - "11235:11235"
```

### 4.3 GitHub Actions

#### 4.3.1 Build + Push Workflow

```yaml
# .github/workflows/docker-build-push.yml
name: Build and Push Docker Image

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:
    branches: [main]

env:
  IMAGE_NAME: firecrawl-searxng-crawl4ai-proxy

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun test

  build-and-push:
    needs: test
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ secrets.DOCKER_USERNAME }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=tag
            type=sha,prefix={{branch}}-
            type=raw,value=latest,enable={{is_default_branch}}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

#### 4.3.2 Required GitHub Secrets

| Secret Name        | Description                |
| ------------------ | -------------------------- |
| `DOCKER_USERNAME`  | Docker Hub username        |
| `DOCKER_PASSWORD`  | Docker Hub password/token  |

### 4.4 `.dockerignore`

```dockerignore
node_modules
tests
.git
.github
*.md
.env
.env.example
docker-compose.yml
```

---

## 5. Implementation Order

| Phase | Scope                               | Deliverable                                |
| ----- | ----------------------------------- | ------------------------------------------ |
| 1     | Project scaffold                    | `tsconfig.json`, `src/config.ts`, `.env.example`, `package.json` scripts |
| 2     | Test harness                        | `tests/*.test.ts` — all test files, red initially |
| 3     | Health endpoint + server skeleton   | `src/index.ts`, `src/routes/health.ts`     |
| 4     | Search endpoint (SearXNG adapter)   | `src/routes/search.ts`, `src/adapters/searxng.ts`, `src/types/searxng.ts` |
| 5     | Scrape endpoint (Crawl4AI adapter)  | `src/routes/scrape.ts`, `src/adapters/crawl4ai.ts`, `src/types/crawl4ai.ts` |
| 6     | Docker + CI                         | `Dockerfile`, `.dockerignore`, `.github/workflows/docker-build-push.yml`, `docker-compose.yml` |
| 7     | Integration verification            | All tests green, manual smoke test against real SearXNG + Crawl4AI |

---

## 6. Notes

- **SearXNG JSON must be enabled** — the self-hosted SearXNG instance needs `format: json` allowed in `settings.yml`. Document in README.
- **Crawl4AI `.llm.env`** — only needed for LLM extraction; basic markdown/HTML scrape works without it.
- **No caching in v1** — caching can be added later as a proxy-side in-memory or Redis layer.
- **Compatibility** — this proxy targets the Firecrawl v2 API shape used by `firecrawl` npm SDK v4.x methods `app.search()` and `app.scrape()`.
