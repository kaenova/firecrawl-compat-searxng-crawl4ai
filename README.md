# 🔥 firecrawl-searxng-crawl4ai-proxy

> A **Firecrawl-compatible API proxy** powered by **Whoogle** + **SearXNG** (search) and **Crawl4AI** (scrape). Drop-in replacement for Firecrawl v2 `/search` and `/scrape` endpoints — self-hosted, zero-cost, fully open-source.

[![Bun](https://img.shields.io/badge/Bun-1.3+-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue?logo=typescript)](https://typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://docker.com)
[![Tests](https://img.shields.io/badge/Tests-53%20passing-brightgreen)](https://github.com/kaenova/firecrawl-compat-searxng-crawl4ai/actions)

---

## 🚀 Quick Start

### Option 1 — Docker Compose (recommended)

One command spins up the proxy + all three backends:

```bash
git clone https://github.com/kaenova/firecrawl-compat-searxng-crawl4ai.git
cd firecrawl-compat-searxng-crawl4ai
docker compose up
```

Services exposed:
- Proxy UI + API → `http://localhost:3002`
- Whoogle Search → `http://localhost:5000`
- SearXNG JSON → `http://localhost:8080`
- Crawl4AI → `http://localhost:11235`

Open `http://localhost:3002/#/dashboard` in your browser.

### Option 2 — Docker Containers (manual)

Provision each backend separately, then run the proxy:

```bash
# 1. Whoogle
docker run -d -p 5000:5000 --name whoogle \
  benbusby/whoogle-search:latest

# 2. SearXNG (pre-configured JSON output)
docker run -d -p 8080:8080 --name searxng \
  kaenova/searxng-json:latest

# 3. Crawl4AI
docker run -d -p 11235:11235 --name crawl4ai \
  unclecode/crawl4ai:latest

# 4. Proxy
docker run -d -p 3002:3002 \
  -e WHOOGLE_ENDPOINT=http://host.docker.internal:5000 \
  -e SEARXNG_URL=http://host.docker.internal:8080 \
  -e CRAWL4AI_URL=http://host.docker.internal:11235 \
  -e SEARCH_PRIORITY=whoogle,searxng \
  -e ACTIVITY_DB_PATH=/app/data/activity.db \
  -v ./activity-data:/app/data \
  --name proxy \
  kaenova/firecrawl-searxng-crawl4ai-proxy:latest
```

> **Note:** `host.docker.internal` works on Docker Desktop (macOS/Windows). On Linux, use the container IPs or run all containers on the same user-defined network.

### Option 3 — Local Development (Bun)

```bash
git clone https://github.com/kaenova/firecrawl-compat-searxng-crawl4ai.git
cd firecrawl-compat-searxng-crawl4ai
bun install
cp .env.example .env
# Edit .env — set WHOOGLE_ENDPOINT, SEARXNG_URL, and CRAWL4AI_URL
bun run dev   # watch mode on localhost:3002
```

---

## ✨ Features

| Feature | Status | Backend |
|---------|--------|---------|
| `POST /v2/search` | ✅ Fully working | Whoogle + SearXNG (priority fallback) |
| `POST /v2/scrape` | ✅ Fully working | Crawl4AI (async polling bridge) |
| `GET /v2/health` | ✅ Liveness check | — |
| Firecrawl SDK v4 compatibility | ✅ Verified | `firecrawl` npm package |
| Bearer-token auth | ✅ Optional | `FIRECRAWL_API_KEY` |
| Docker + Docker Compose | ✅ Ready | multi-stage build |
| GitHub Actions CI/CD | ✅ Ready | test → build → push |

---

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  Firecrawl SDK  │────▶│     This Proxy       │────▶│   Whoogle   │
│  (or raw HTTP)  │     │  Bun + TypeScript    │     │  (search #1)│
└─────────────────┘     └──────────────────────┘     └─────────────┘
                               │                           │
                               ▼                           ▼ fallback
                        ┌─────────────┐             ┌─────────────┐
                        │  Crawl4AI   │             │   SearXNG     │
                        │  (scrape)   │             │  (search #2)  │
                        └─────────────┘             └─────────────┘
```

The proxy maps Firecrawl v2 request/response shapes to Whoogle, SearXNG, and Crawl4AI native APIs:

- **Search**: Whoogle is queried first by default (`SEARCH_PRIORITY=whoogle,searxng`). If Whoogle fails (CAPTCHA, unreachable), the proxy automatically falls back to SearXNG. You can reverse the priority or use only one backend.
- **Scrape**: Firecrawl parameters → Crawl4AI `POST /crawl` + polling `GET /task/:id` until `completed`

---

## ⚙️ Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEARXNG_URL` | ✅ | — | Base URL of SearXNG instance (must serve JSON) |
| `CRAWL4AI_URL` | ✅ | — | Base URL of Crawl4AI REST API |
| `WHOOGLE_ENDPOINT` | ❌* | — | Base URL of Whoogle instance |
| `SEARCH_PRIORITY` | ❌ | `whoogle,searxng` | Comma-ordered fallback list (`whoogle,searxng` or `searxng,whoogle`) |
| `PORT` | ❌ | `3002` | Proxy listen port |
| `SCRAPE_TIMEOUT` | ❌ | `60` | Max seconds to poll a Crawl4AI job |
| `POLL_INTERVAL` | ❌ | `1000` | Milliseconds between poll attempts |
| `FIRECRAWL_API_KEY` | ❌ | — | Optional Bearer-token auth key |
| `ACTIVITY_DB_PATH` | ❌ | `activity.db` | Path to SQLite activity database |

\* Required only if `SEARCH_PRIORITY` includes `whoogle`.

### `.env.example`

```env
WHOOGLE_ENDPOINT=http://localhost:5000
SEARXNG_URL=http://localhost:8080
CRAWL4AI_URL=http://localhost:11235
PORT=3002
SCRAPE_TIMEOUT=60
POLL_INTERVAL=1000
SEARCH_PRIORITY=whoogle,searxng
# FIRECRAWL_API_KEY=your-secret-key
```

---

## 📡 API Endpoints

### `GET /v2/health`

Liveness check.

```json
{ "status": "ok" }
```

### `POST /v2/search`

Firecrawl-compatible search backed by Whoogle (primary) and SearXNG (fallback).

**Request body:**

```json
{
  "query": "bun javascript runtime",
  "limit": 5,
  "page": 1,
  "country": "us",
  "tbs": "qdr:w",
  "includeDomains": ["github.com"],
  "excludeDomains": ["pinterest.com"]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "web": [
      {
        "url": "https://github.com/oven-sh/bun",
        "title": "oven-sh/bun: Incredibly fast JavaScript runtime",
        "description": "Bun is an all-in-one JavaScript runtime...",
        "category": "general"
      }
    ]
  }
}
```

**Parameter mapping:**

| Firecrawl | Whoogle | SearXNG | Notes |
|-----------|---------|---------|-------|
| `query` | `q` | `q` | Direct passthrough |
| `page` | — | `pageno` | Whoogle ignores; SearXNG uses it |
| `limit` | — | — | Client-side `.slice(0, limit)` |
| `country` | — | `language` | `us` → `en`, `id` → `id`, etc. |
| `tbs` | — | `time_range` | `qdr:w` → `week`, `qdr:m` → `month`, etc. |
| `includeDomains` | — | appended to `q` | `site:domainA OR site:domainB` |
| `excludeDomains` | — | appended to `q` | `-site:domainA -site:domainB` |

### `POST /v2/scrape`

Firecrawl-compatible scrape backed by Crawl4AI (async → sync bridge).

**Request body:**

```json
{
  "url": "https://example.com",
  "formats": ["markdown", "html"],
  "waitFor": 2000,
  "mobile": false,
  "onlyMainContent": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "markdown": "# Example Domain\n\nThis domain is...",
    "html": "<html><body><div><h1>Example Domain</h1>...</div></body></html>",
    "metadata": {
      "title": "Example Domain",
      "description": null,
      "sourceURL": "https://example.com",
      "statusCode": 200
    }
  }
}
```

**How it works:**

1. Proxy submits crawl job to Crawl4AI `POST /crawl`
2. Polls `GET /task/{task_id}` every `POLL_INTERVAL` ms
3. On `status="completed"`, transforms result to Firecrawl shape
4. On timeout → `504`; on failure → `502`

---

## 🧪 Testing

Two-layer test harness ensures full Firecrawl compatibility:

| Layer | Approach | Files |
|-------|----------|-------|
| **A — SDK Integration** | Real `firecrawl` npm package pointed at proxy | `tests/sdk/*.sdk.test.ts` |
| **B — Pure HTTP** | Direct `fetch()` calls with mock backends | `tests/api/*.test.ts` |

```bash
# Run all tests
bun test

# Run specific layer
bun test tests/api/
bun test tests/sdk/
```

**Mock strategy:** All tests spin up in-process mock SearXNG / Crawl4AI servers — no external services required.

---

## 💾 Request Activity Persistence

The proxy stores request activity (search, scrape, and playground calls) in a **SQLite database**. This enables the dashboard to show metrics and request history that survive server restarts.

Only **high-priority `/v2/*` paths** are persisted:
- `POST /v2/search`
- `POST /v2/scrape`

Playground proxy calls and health checks are **not** persisted.

### Database path

| Environment | Default path | Override via |
|-------------|--------------|--------------|
| Local dev | `./activity.db` (repo root) | `ACTIVITY_DB_PATH` env var |
| Docker | `/app/data/activity.db` | `ACTIVITY_DB_PATH` env var + volume mount |

### Dashboard endpoints

- `GET /api/metrics?granularity=5m` — latency, success/failure rates, time series
- `GET /api/activity` — paginated, filterable, searchable request log

---

## 🔐 Authentication (Optional)

Set `FIRECRAWL_API_KEY` in your environment. The proxy will then require:

```
Authorization: Bearer <your-api-key>
```

on every request. Returns `401 Unauthorized` if missing or invalid.

---

## 🧩 Using with Firecrawl SDK

```ts
import FirecrawlApp from "firecrawl";

const app = new FirecrawlApp({
  apiKey: "any-key",           // ignored unless FIRECRAWL_API_KEY is set on proxy
  apiUrl: "http://localhost:3002",  // ← point at this proxy
});

const search = await app.search("bun runtime");
const scrape = await app.scrape("https://example.com", { formats: ["markdown"] });
```

---

## 🐳 Docker Reference

### Pull & Run (proxy only)

```bash
docker pull kaenova/firecrawl-searxng-crawl4ai-proxy:latest
docker run -p 3002:3002 \
  -e WHOOGLE_ENDPOINT=http://host.docker.internal:5000 \
  -e SEARXNG_URL=http://host.docker.internal:8080 \
  -e CRAWL4AI_URL=http://host.docker.internal:11235 \
  -e SEARCH_PRIORITY=whoogle,searxng \
  -e ACTIVITY_DB_PATH=/app/data/activity.db \
  -v ./activity-data:/app/data \
  kaenova/firecrawl-searxng-crawl4ai-proxy:latest
```

> Mount a volume for the SQLite activity database so request logs persist across container restarts. The default database path inside the container is `/app/activity.db`. Use `ACTIVITY_DB_PATH` to relocate it (e.g. to a volume-mounted directory) as shown above.

### Build locally

```bash
docker build -t firecrawl-proxy .
docker run -p 3002:3002 \
  -e WHOOGLE_ENDPOINT=http://host.docker.internal:5000 \
  -e SEARXNG_URL=http://host.docker.internal:8080 \
  -e CRAWL4AI_URL=http://host.docker.internal:11235 \
  -e SEARCH_PRIORITY=whoogle,searxng \
  -e ACTIVITY_DB_PATH=/app/data/activity.db \
  -v ./activity-data:/app/data \
  firecrawl-proxy
```

### Backend images

- **Whoogle** — `benbusby/whoogle-search:latest` ([Docker Hub](https://hub.docker.com/r/benbusby/whoogle-search)) — self-hosted privacy-respecting Google proxy with JSON API support.
- **SearXNG JSON** — `kaenova/searxng-json:latest` ([Docker Hub](https://hub.docker.com/r/kaenova/searxng-json/tags) · [GitHub](https://github.com/kaenova/searxng-json-docker)) — pre-configured for JSON output so the proxy can parse results without HTML scraping.
- **Crawl4AI** — `unclecode/crawl4ai:latest` ([Docker Hub](https://hub.docker.com/r/unclecode/crawl4ai)) — the official async web-crawling engine.

---

## 📦 Tech Stack

- **Runtime:** [Bun](https://bun.sh) v1.3+
- **Language:** TypeScript 5.9+
- **Test Runner:** Built-in `bun:test`
- **Search Backends:** [Whoogle](https://github.com/benbusby/whoogle-search) (primary) + [SearXNG](https://github.com/searxng/searxng) (fallback) — proxy uses [kaenova/searxng-json](https://hub.docker.com/r/kaenova/searxng-json/tags) for JSON-native output ([source](https://github.com/kaenova/searxng-json-docker))
- **Scrape Backend:** [Crawl4AI](https://github.com/unclecode/crawl4ai) — available on Docker Hub as [`unclecode/crawl4ai`](https://hub.docker.com/r/unclecode/crawl4ai)
- **Container:** Docker + Docker Compose
- **CI/CD:** GitHub Actions

---

## 📝 License

MIT — feel free to self-host, fork, and extend.

---

> Built with ❤️ using Bun, Whoogle, SearXNG, and Crawl4AI. Not affiliated with Firecrawl Inc.
