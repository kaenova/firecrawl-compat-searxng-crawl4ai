# PLAN — Web UI for firecrawl-searxng-crawl4ai-proxy

<!-- ============================================================
     Overview: Add a React + shadcn/ui SPA served from the Bun
     backend at /#/...  — no auth, fully client-side routed.
     FOUR pages: Dashboard, API Playground, Request Activity.

     Project root: firecrawl-searxng-crawl4ai-proxy/
============================================================ -->

---

## 1. Architecture Decision

| Concern            | Decision                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| **Frontend**       | React 19 + TypeScript, Vite 6, `react-router` v7 (hash routing `/#/...`) |
| **Component lib**  | shadcn/ui (Radix primitives + Tailwind CSS v4)                           |
| **Charts**         | Recharts (Dashboard graphs)                                              |
| **Icons**          | lucide-react                                                             |
| **Data fetching**  | Plain `fetch()` from the Bun backend (same origin, no CORS)              |
| **Serving**        | Bun serves `client/dist/` for non-API paths; SPA fallback to `index.html`|
| **Auth**           | None on web UI — public dashboard                                        |
| **New API routes** | `GET /api/metrics`, `GET /api/activity` — internal-only, no Firecrawl auth |

---

## 2. Directory Structure (new additions)

```
firecrawl-searxng-crawl4ai-proxy/
├── client/                        ← NEW: React SPA
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── index.css              (Tailwind + shadcn CSS vars)
│   │   ├── lib/
│   │   │   └── utils.ts           (cn() helper)
│   │   ├── components/
│   │   │   ├── ui/                ← shadcn components (button, card, table, dialog, etc.)
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   └── AppLayout.tsx
│   │   │   ├── dashboard/
│   │   │   │   ├── StatCard.tsx
│   │   │   │   ├── LatencyChart.tsx
│   │   │   │   ├── ThroughputChart.tsx
│   │   │   │   ├── SuccessRateChart.tsx
│   │   │   │   └── RecentRequests.tsx
│   │   │   ├── playground/
│   │   │   │   ├── EndpointSelector.tsx
│   │   │   │   ├── RequestForm.tsx
│   │   │   │   └── ResponseViewer.tsx
│   │   │   └── activity/
│   │   │       ├── ActivityFilters.tsx
│   │   │       ├── ActivityTable.tsx
│   │   │       └── RequestDetailDialog.tsx
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── PlaygroundPage.tsx
│   │   │   └── ActivityPage.tsx
│   │   ├── hooks/
│   │   │   ├── useMetrics.ts
│   │   │   └── useActivity.ts
│   │   └── types/
│   │       └── api.ts
│   └── components.json            ← shadcn config
│
├── src/                            ← EXISTING Bun backend
│   ├── index.ts                    ← ** MODIFY: add SPA serving + new API routes
│   ├── routes/
│   │   ├── metrics.ts              ← NEW: GET /api/metrics
│   │   └── activity.ts             ← NEW: GET /api/activity
│   ├── activity-store.ts           ← NEW: in-memory ring buffer for request logs
│   └── metrics-store.ts            ← NEW: in-memory metrics aggregator
│
└── package.json                    ← ** MODIFY: add root scripts
```

---

## 3. Phase 1 — Scaffold React Client (Vite + shadcn)

### 3.1 Create Vite + React + TypeScript project

Inside `client/`, use `bun create vite --template react-ts`. Then add deps:

```bash
cd client
bun add react-router-dom recharts lucide-react
bun add -D @types/react @types/react-dom tailwindcss @tailwindcss/vite
```

### 3.2 Initialize shadcn/ui

```bash
npx shadcn@latest init
# - TypeScript: yes
# - Style: New York
# - Base color: Zinc
# - CSS vars: yes
```

Then add required components:

```bash
npx shadcn@latest add button card table dialog input select tabs
npx shadcn@latest add separator tooltip badge dropdown-menu
npx shadcn@latest add skeleton scroll-area
```

### 3.3 Configure Vite

```ts
// client/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/", // served from root
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "dist",
  },
});
```

### 3.4 Hash Router Setup

Use `createHashRouter` from `react-router-dom` so that all pages are under `/#/dashboard`, `/#/playground`, `/#/activity`.

```tsx
// client/src/App.tsx (sketch)
import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/pages/DashboardPage";
import { PlaygroundPage } from "@/pages/PlaygroundPage";
import { ActivityPage } from "@/pages/ActivityPage";

const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/playground", element: <PlaygroundPage /> },
      { path: "/activity", element: <ActivityPage /> },
    ],
  },
]);
```

---

## 4. Phase 2 — Backend: Activity Store + Metrics + API Routes

### 4.1 Activity Store (in-memory ring buffer)

```
File: src/activity-store.ts
```

Store the last N requests (default 5000) with: `id`, `timestamp`, `method`, `path`, `status`, `durationMs`, `requestBody` (truncated), `responseBody` (truncated), `error` (if any).

Expose:
- `record(req: ActivityEntry)` — called from `logRequest` / `logFailure`
- `query(filter: ActivityFilter): ActivityEntry[]` — filter by method, path, status, time range, search text (on `JSON.stringify(entry)`)
- `stats(timeRange: {from, to}, granularity: string): Metrics` — aggregate stats

### 4.2 Metrics Store

```
File: src/metrics-store.ts
```

Track cumulative counters + time-series buckets (1m, 5m, 1h):

| Metric              | Description                                     |
| ------------------- | ----------------------------------------------- |
| `total_requests`    | Total requests since start                      |
| `success_count`     | 2xx responses                                   |
| `error_count`       | 4xx + 5xx                                       |
| `latency_p50`       | 50th percentile latency (last window)           |
| `latency_p95`       | 95th percentile latency (last window)           |
| `latency_p99`       | 99th percentile latency (last window)           |
| `timeseries`        | Array of `{timestamp, count, avgLatency, errorCount}` per bucket |

Granularity options: `1m`, `5m`, `15m`, `1h`

### 4.3 API Routes

#### `GET /api/metrics?from=ISO&to=ISO&granularity=5m`

Response:

```json
{
  "summary": {
    "total": 1234,
    "success": 1100,
    "errors": 134,
    "p50": 45,
    "p95": 230,
    "p99": 890
  },
  "timeseries": [
    { "timestamp": "2025-06-13T10:00:00Z", "count": 45, "avgLatency": 60, "errors": 2 },
    ...
  ],
  "byEndpoint": {
    "/v2/search": { "count": 500, "avgLatency": 120, "errors": 10 },
    "/v2/scrape": { "count": 300, "avgLatency": 4500, "errors": 50 }
  }
}
```

#### `GET /api/activity?method=POST&path=/v2/scrape&status=200&search=github&from=ISO&to=ISO&limit=50&offset=0`

Response:

```json
{
  "total": 342,
  "items": [
    {
      "id": "req_abc123",
      "timestamp": "2025-06-13T10:05:00Z",
      "method": "POST",
      "path": "/v2/scrape",
      "status": 200,
      "durationMs": 4523,
      "requestBody": { "url": "https://github.com/kaenova/...", "formats": ["markdown"] },
      "responseBody": { "success": true, "data": { "markdown": "# firecrawl..." } },
      "error": null
    }
  ]
}
```

### 4.4 Integration into `src/index.ts`

Modify `appFetch()` to add these routes **before** the Firecrawl-auth check (they're internal, no API key needed):

```ts
// NEW routes — no auth
if (req.method === "GET" && path === "/api/metrics") {
  return handleMetrics(req);
}
if (req.method === "GET" && path === "/api/activity") {
  return handleActivity(req);
}
```

Modify `logRequest()` / `logFailure()` to also call `activityStore.record(...)` and `metricsStore.record(...)`.

Also, add SPA serving for non-API paths — when a path doesn't match any API route, serve `client/dist/index.html` (SPA fallback) or the requested static file.

---

## 5. Phase 3 — Pages (React)

### 5.1 Sidebar Layout (`components/layout/`)

```
┌──────────────────────────────────────────────┐
│  ┌────────┐  ┌─────────────────────────────┐ │
│  │ Logo   │  │                             │ │
│  │────────│  │                             │ │
│  │ 📊 Dash│  │      Page Content           │ │
│  │ 🧪 Play│  │                             │ │
│  │ 📋 Act │  │                             │ │
│  │        │  │                             │ │
│  │        │  │                             │ │
│  └────────┘  └─────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Sidebar has 3 nav items with icons (lucide-react):
- **Dashboard** — `LayoutDashboard` icon
- **API Playground** — `Play` icon
- **Request Activity** — `List` icon

Collapsible sidebar (optional later), active state highlighted.

### 5.2 Dashboard Page

Layout:

```
┌──────────────────────────────────────────────────────────┐
│  [Total Requests] [Success Rate] [Avg Latency] [Errors]  │  ← StatCards
│                                                          │
│  ┌─────────────────────┐ ┌──────────────────────────────┐│
│  │  Latency Chart      │ │  Throughput Chart            ││
│  │  (line, p50/p95/p99)│ │  (bar, req/min)              ││
│  └─────────────────────┘ └──────────────────────────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Recent Requests (table, last 10)                    ││
│  │  Timestamp | Method | Path | Status | Duration       ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [Time Range Selector: 15m | 1h | 6h | 24h | Custom]   │
│  [Granularity: 1m | 5m | 15m | 1h]                     │
└──────────────────────────────────────────────────────────┘
```

Data from `GET /api/metrics?from=...&to=...&granularity=...`.

Charts use Recharts (`LineChart`, `BarChart`, `ResponsiveContainer`).

StatCards show:
- **Total Requests** — number + trend arrow
- **Success Rate** — percentage (green/red)
- **Avg Latency** — ms, with p95
- **Error Count** — number

### 5.3 API Playground Page

Three sections/tabs — Firecrawl Proxy, Crawl4AI, SearXNG.

#### Firecrawl Proxy tab

Dropdown: `/v2/search`, `/v2/scrape`

**Search form:**

| Field       | Type     | Default         |
| ----------- | -------- | --------------- |
| query       | text     | ""              |
| page        | number   | 1               |
| limit       | number   | 10              |
| format      | select   | markdown        |
| source      | select   | web             |

**Scrape form:**

| Field       | Type     | Default                             |
| ----------- | -------- | ----------------------------------- |
| url         | text     | ""                                  |
| formats     | multi-select | markdown, html, rawHtml, screenshot |
| onlyMainContent | toggle | true                            |
| waitFor     | number   | 0 (ms)                              |
| timeout     | number   | 30000 (ms)                          |

#### Crawl4AI tab

Dropdown: `POST /crawl/job`, `GET /crawl/job/{task_id}`

**Job submit form:**

| Field       | Type     | Default            |
| ----------- | -------- | ------------------ |
| url         | text     | ""                 |
| output_format| select  | markdown           |
| priority    | number   | 5                  |

**Job poll form:**

| Field       | Type     | Default            |
| ----------- | -------- | ------------------ |
| task_id     | text     | ""                 |

#### SearXNG tab

Dropdown: `GET /search`

| Field       | Type     | Default            |
| ----------- | -------- | ------------------ |
| q           | text     | ""                 |
| format      | select   | json               |
| categories  | multi-select | general         |
| pageno      | number   | 1                  |

#### Response Viewer

Large `<pre>` block (or `<ScrollArea>`) showing the JSON response, syntax-highlighted. Auto-scrolls to bottom on new response.

### 5.4 Request Activity Page

```
┌──────────────────────────────────────────────────────────┐
│  [Search: ___________________________ 🔍]                │
│                                                          │
│  Filters:                                                │
│  Method: [All | GET | POST]   Path: [All | /v2/search | /v2/scrape | ...] │
│  Status: [All | 2xx | 4xx | 5xx]                        │
│  Time:   [Last 15m | 1h | 6h | 24h | Custom date picker]│
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Table (sortable columns):                            ││
│  │ Time | Method | Path | Status | Duration |           ││
│  │──────────────────────────────────────────────────────││
│  │ 10:05 | POST | /v2/scrape | 200 | 4.5s |  [View]   ││
│  │ 10:04 | POST | /v2/search | 200 | 120ms|  [View]   ││
│  └──────────────────────────────────────────────────────┘│
│  [Pagination: ← 1 2 3 ... →]                            │
└──────────────────────────────────────────────────────────┘
```

Search works across `JSON.stringify(entry)`, so it matches any text in request body + response body.

Clicking a row opens a **Dialog** with two tabs: **Request** (pretty-printed JSON body) and **Response** (pretty-printed JSON body).

Pagination: offset/limit, server-side via `GET /api/activity?offset=...&limit=...`.

---

## 6. Phase 4 — Backend: Serve SPA from Bun

Modify `src/index.ts`:

```ts
// After all API routes, add static file serving + SPA fallback

const STATIC_DIR = path.join(import.meta.dir, "../client/dist");

// If no API route matched, try to serve a static file
const filePath = path.join(STATIC_DIR, url.pathname);
const file = Bun.file(filePath);
if (await file.exists()) {
  return new Response(file);
}

// SPA fallback — serve index.html for all other paths
return new Response(Bun.file(path.join(STATIC_DIR, "index.html")));
```

The order matters: API routes first, then static files, then SPA fallback.

---

## 7. Phase 5 — Root Scripts & Build

Update root `package.json`:

```json
{
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "start": "bun run src/index.ts",
    "test": "bun test",
    "client:dev": "cd client && bun run dev",
    "client:build": "cd client && bun run build",
    "build": "cd client && bun run build",
    "dev:full": "bun run client:build && bun run dev"
  }
}
```

Docker build must also run `bun run client:build` before `bun run start`.

---

## 8. Phase 6 — Tests (existing + new)

Existing test suite (`tests/`) must continue to pass. No changes to Firecrawl API routes — only additive.

New test files:

- `tests/api/metrics.test.ts` — test `GET /api/metrics` returns valid shape
- `tests/api/activity.test.ts` — test `GET /api/activity` with filters

---

## 9. Implementation Order

| Phase | Scope                                    | Key deliverable                                              |
| ----- | ---------------------------------------- | ------------------------------------------------------------ |
| 1     | Scaffold React client                    | Vite + React + shadcn + router, `bun run client:dev` works   |
| 2     | Backend activity + metrics store         | `activity-store.ts`, `metrics-store.ts`, insert into logger  |
| 3     | API routes `/api/metrics`, `/api/activity` | Endpoints return documented shapes                          |
| 4     | Serve SPA from Bun                       | `/#/...` loads the React app via Bun                         |
| 5     | Dashboard page                           | StatCards, charts (Recharts), time range, recent requests    |
| 6     | API Playground page                      | 3 provider tabs, dynamic forms, response viewer              |
| 7     | Request Activity page                    | Table, filters, search, detail dialog                        |
| 8     | Polish + tests                           | Add new test files, verify existing 23 tests still pass      |
| 9     | Docker + CI update                       | Multi-stage Dockerfile (build client + bundle)               |

---

## 10. Notes

- **No auth on web UI** — dashboard, playground, activity are all public.
- **Metrics/activity are in-memory only** — lost on restart. For production, can swap to SQLite later. This is fine for v1.
- **Tailwind v4** — shadcn/ui now defaults to Tailwind v4 with `@tailwindcss/vite` plugin. Configure accordingly.
- **Charts are client-side** — Recharts renders from the metrics JSON. No server-side chart rendering.
- **Port same as backend** — the web UI is served from the same Bun server, no separate dev server needed in production. For local dev, `bun run client:dev` runs Vite dev server on port 5173 with proxy to backend — optional convenience.
- **Backward compatible** — no existing API endpoints are changed. Only additive.
