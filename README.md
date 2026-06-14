# 🔥 firecrawl-searxng-crawl4ai-proxy

> A **Firecrawl-compatible API proxy** powered by **SearXNG** (search) and **Crawl4AI** (scrape). Drop-in replacement for Firecrawl v2 `/search` and `/scrape` endpoints — self-hosted, zero-cost, fully open-source.

[![Bun](https://img.shields.io/badge/Bun-1.3+-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue?logo=typescript)](https://typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://docker.com)
[![Tests](https://img.shields.io/badge/Tests-54%20passing-brightgreen)](https://github.com/kaenova/firecrawl-compat-searxng-crawl4ai/actions)

---

## ✨ Features

| Feature | Status | Backend |
|---------|--------|---------|
| `POST /v2/search` | ✅ Fully working | SearXNG (self-hosted) |
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
│  Firecrawl SDK  │────▶│     This Proxy       │────▶│   SearXNG   │
│  (or raw HTTP)  │     │  Bun + TypeScript    │     │  (search)   │
└─────────────────┘     └──────────────────────┘     └─────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │  Crawl4AI   │
                        │  (scrape)   │
                        └─────────────┘
```

The proxy maps Firecrawl v2 request/response shapes to SearXNG and Crawl4AI native APIs:

- **Search**: Firecrawl parameters → SearXNG `q`, `pageno`, `language`, `time_range`, `site:` filters
- **Scrape**: Firecrawl parameters → Crawl4AI `POST /crawl` + polling `GET /task/:id` until `completed`

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/kaenova/firecrawl-compat-searxng-crawl4ai.git
cd firecrawl-compat-searxng-crawl4ai
bun install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env — at minimum set SEARXNG_URL and CRAWL4AI_URL
```

### 3. Run

```bash
bun run src/index.ts
# or
bun run dev      # watch mode
```

Server starts on `http://localhost:3002` by default.

---

## ⚙️ Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SEARXNG_URL` | ✅ | — | Base URL of SearXNG instance (must serve JSON) |
| `CRAWL4AI_URL` | ✅ | — | Base URL of Crawl4AI REST API |
| `PORT` | ❌ | `3002` | Proxy listen port |
| `SCRAPE_TIMEOUT` | ❌ | `60` | Max seconds to poll a Crawl4AI job |
| `POLL_INTERVAL` | ❌ | `1000` | Milliseconds between poll attempts |
| `FIRECRAWL_API_KEY` | ❌ | — | Optional Bearer-token auth key |
| `ACTIVITY_DB_PATH` | ❌ | `activity.db` | Path to SQLite activity database |

### `.env.example`

```env
SEARXNG_URL=http://localhost:8080
CRAWL4AI_URL=http://localhost:11235
PORT=3002
SCRAPE_TIMEOUT=60
POLL_INTERVAL=1000
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

Firecrawl-compatible search backed by SearXNG.

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

| Firecrawl | SearXNG | Notes |
|-----------|---------|-------|
| `query` | `q` | Direct passthrough |
| `page` | `pageno` | Direct passthrough |
| `limit` | — | Client-side `.slice(0, limit)` |
| `country` | `language` | `us` → `en`, `id` → `id`, etc. |
| `tbs` | `time_range` | `qdr:w` → `week`, `qdr:m` → `month`, etc. |
| `includeDomains` | appended to `q` | `site:domainA OR site:domainB` |
| `excludeDomains` | appended to `q` | `-site:domainA -site:domainB` |

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

## 🐳 Docker

### Pull from Docker Hub

```bash
docker pull kaenova/firecrawl-searxng-crawl4ai-proxy:latest
docker run -p 3002:3002 \
  -e SEARXNG_URL=http://host.docker.internal:8080 \
  -e CRAWL4AI_URL=http://host.docker.internal:11235 \
  -e ACTIVITY_DB_PATH=/app/data/activity.db \
  -v ./activity-data:/app/data \
  kaenova/firecrawl-searxng-crawl4ai-proxy:latest
```

> **Note:** Mount a volume for the SQLite activity database so request logs persist across container restarts. The default database path inside the container is `/app/activity.db`. Use `ACTIVITY_DB_PATH` to relocate it (e.g. to a volume-mounted directory) as shown above.

### Build & Run

```bash
docker build -t firecrawl-proxy .
docker run -p 3002:3002 \
  -e SEARXNG_URL=http://host.docker.internal:8080 \
  -e CRAWL4AI_URL=http://host.docker.internal:11235 \
  -e ACTIVITY_DB_PATH=/app/data/activity.db \
  -v ./activity-data:/app/data \
  firecrawl-proxy
```

### Docker Compose (dev stack)

```bash
docker compose up
```

Spins up:
- `proxy` on port `3002`
- `searxng` on port `8080`
- `crawl4ai` on port `11235`

A named volume `activity-db` is mounted at `/app/data` and `ACTIVITY_DB_PATH` is set to `/app/data/activity.db` so request activity persists across restarts.

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
| Docker | `/app/activity.db` | `ACTIVITY_DB_PATH` env var + volume mount |

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

## 📦 Tech Stack

- **Runtime:** [Bun](https://bun.sh) v1.3+
- **Language:** TypeScript 5.9+
- **Test Runner:** Built-in `bun:test`
- **Search Backend:** [SearXNG](https://github.com/searxng/searxng)
- **Scrape Backend:** [Crawl4AI](https://github.com/unclecode/crawl4ai)
- **Container:** Docker + Docker Compose
- **CI/CD:** GitHub Actions

---

## 📝 License

MIT — feel free to self-host, fork, and extend.

---

> Built with ❤️ using Bun, SearXNG, and Crawl4AI. Not affiliated with Firecrawl Inc.
