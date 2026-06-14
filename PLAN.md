# Request Activity + Playground Reliability Implementation Plan

> **For Hermes:** Use `subagent-driven-development` to implement this plan task-by-task.

**Goal:** Persist request activity to SQLite, fix the playground 500 errors, and only save activity for high-priority paths.

**Architecture:** Keep the current Bun proxy/API design, but replace the in-memory activity buffer with a SQLite-backed store for persisted request activity. Add a tight allowlist so only important paths are written to the activity table. In parallel, harden the frontend playground proxy endpoints so bad upstream responses become explicit non-500 failures with useful error bodies.

**Tech Stack:** Bun, TypeScript, SQLite, existing logger/activity dashboard code, existing playground proxy routes, existing tests.

---

## 1. Scope and Outcomes

### 1.1 What this plan changes

1. Save request activity into SQLite instead of memory-only storage.
2. Fix the playground proxy so `searxng` and `crawl4ai` requests do not collapse into generic `500 Internal Server Error`.
3. Restrict persisted request activity to **high-priority paths only**.

### 1.2 High-priority paths to persist

Only these paths should be written to the activity database:

- `POST /v2/search`
- `POST /v2/scrape`
- `GET /api/proxy/searxng/search`
- `POST /api/proxy/crawl4ai/crawl/job`
- `GET /api/proxy/crawl4ai/crawl/job/:id`

Optional, if you want visibility but not persistence, keep them only in console logs:

- `GET /v2/health`
- `GET /api/metrics`
- `GET /api/activity`

### 1.3 Non-goals

- No auth changes.
- No new frontend pages.
- No rewrite of search/scrape business logic unless needed to fix the playground 500.
- No persistence for every static asset request.

---

## 2. Current Codebase Facts

### 2.1 Request activity is currently in memory

The current logger stores activity in `src/logger.ts` with an in-memory `logBuffer: ActivityLog[] = []` capped at 5000 entries.

### 2.2 Activity reads from that in-memory buffer

`src/stores/activity-store.ts` reads via `getAllLogs()` and filters/searches in memory.

### 2.3 Metrics are derived from the same log buffer

`src/stores/metrics-store.ts` also reads from `getAllLogs()`.

### 2.4 Playground proxy routes are pass-through handlers

`src/routes/api/proxy.ts` forwards requests to SearXNG and Crawl4AI with little or no protective handling, which is a likely source of the 500s.

---

## 3. Proposed Architecture

### 3.1 Move request activity persistence to SQLite

Create a small SQLite-backed activity repository that stores only the high-priority paths. Keep the structured JSON console logs if desired, but decouple persistence from console output.

### 3.2 Add a path allowlist filter

Before a request is persisted, check whether its path belongs to the high-priority set.

### 3.3 Harden playground proxy routes

Make the playground proxy return explicit upstream errors when:
- request JSON is invalid
- upstream fetch fails
- upstream returns non-2xx
- upstream response cannot be parsed

Do not let those errors bubble into a generic 500 unless it is a true unexpected crash.

### 3.4 Keep metrics/activity endpoints reading from the new store

`/api/activity` and `/api/metrics` should query SQLite-backed data, not the in-memory buffer.

---

## 4. Files to Modify or Create

### Backend files

- Modify: `src/logger.ts`
- Modify: `src/stores/activity-store.ts`
- Modify: `src/stores/metrics-store.ts`
- Modify: `src/routes/search.ts`
- Modify: `src/routes/scrape.ts`
- Modify: `src/routes/api/proxy.ts`
- Modify: `src/index.ts`
- Modify: `src/types/dashboard.ts`
- Create: `src/stores/sqlite-activity-store.ts`
- Create: `src/stores/activity-paths.ts`
- Create: `src/db.ts` or `src/storage/db.ts` if the repo already has a storage namespace
- Create: `tests/api/activity-sqlite.test.ts`
- Create: `tests/api/playground-proxy.test.ts`

### Frontend files if needed for diagnostics only

- Modify: `client/src/components/playground/*` only if the playground needs better error display

---

## 5. Task Breakdown

### Task 1: Define the activity persistence contract

**Objective:** Freeze the SQLite row shape and the high-priority path allowlist before changing code.

**Files:**
- Modify: `src/types/dashboard.ts`
- Create: `src/stores/activity-paths.ts`

**Decisions to lock:**
- Persisted row fields: `id`, `timestamp`, `method`, `path`, `status`, `durationMs`, `requestBody`, `responseBody`, `error`
- Only persist the high-priority paths listed above
- Keep truncation behavior for large request/response bodies

**Verification:**
- The allowlist file should be readable from both logger and store code
- The row shape should remain compatible with the dashboard API response

---

### Task 2: Create the SQLite-backed activity store

**Objective:** Persist request activity entries to SQLite with insert/query support.

**Files:**
- Create: `src/stores/sqlite-activity-store.ts`
- Create: `src/db.ts` or `src/storage/db.ts`

**Implementation details:**
- Create the table on startup if missing
- Insert rows only for allowed paths
- Query with search, method, path, status, time range, limit, and offset
- Preserve ordering by newest first
- Keep the implementation minimal; no ORM unless the project already uses one

**Verification:**
- Insert a sample activity row
- Query it back by path
- Confirm disallowed paths are not inserted

---

### Task 3: Wire request logging to SQLite persistence

**Objective:** Make `logRequest()` and `logFailure()` write persisted activity only for high-priority paths.

**Files:**
- Modify: `src/logger.ts`
- Modify: `src/routes/search.ts`
- Modify: `src/routes/scrape.ts`
- Modify: `src/routes/api/proxy.ts`

**Implementation details:**
- Keep JSON console logging if helpful
- Add a persistence call only when the path matches the allowlist
- Truncate request/response bodies before saving if needed
- Do not persist low-priority paths

**Verification:**
- A request to `/v2/search` creates one persisted activity row
- A request to `/api/proxy/searxng/search` creates one persisted activity row
- A request to `/api/metrics` does not create a row

---

### Task 4: Switch activity and metrics reads to the SQLite store

**Objective:** Ensure the dashboard reads from persisted activity data.

**Files:**
- Modify: `src/stores/activity-store.ts`
- Modify: `src/stores/metrics-store.ts`
- Modify: `src/routes/api/activity.ts`
- Modify: `src/routes/api/metrics.ts`

**Implementation details:**
- Replace `getAllLogs()` usage with SQLite queries
- Keep API response shape stable for the frontend
- Preserve filtering/search/pagination behavior
- For metrics, compute from the persisted activity rows

**Verification:**
- `/api/activity` still returns the same shape
- `/api/metrics` still returns summary + time series
- Both endpoints work after restart, proving persistence

---

### Task 5: Fix playground 500s by hardening proxy routes

**Objective:** Make playground proxy requests fail with actionable errors instead of generic 500s.

**Files:**
- Modify: `src/routes/api/proxy.ts`
- Modify: `src/index.ts`
- Create: `tests/api/playground-proxy.test.ts`

**Implementation details:**
- Wrap `req.json()` with explicit invalid JSON handling
- Check upstream `fetch()` status and body safely
- Return meaningful `4xx`/`5xx` responses depending on the failure cause
- Keep the public route contracts unchanged

**Verification:**
- Invalid JSON returns a controlled `400`
- Upstream unreachable returns a controlled `502`
- Unexpected backend response shape does not become an unhelpful generic crash

---

### Task 6: Add tests for path allowlist and persistence behavior

**Objective:** Prove only high-priority paths are stored.

**Files:**
- Create: `tests/api/activity-sqlite.test.ts`
- Modify: existing logger/activity tests if needed

**Test cases:**
- Allowed paths are persisted
- Disallowed paths are not persisted
- Search/pagination still work on persisted rows

**Verification:**
- `bun test` passes
- Tests prove persistence rules are enforced

---

### Task 7: Run live verification and clean up

**Objective:** Confirm the SQLite store, activity filtering, and playground error handling work in the running app.

**Files:**
- No new files unless a small test helper is needed

**Verification checklist:**
- Trigger `/v2/search` and `/v2/scrape`
- Trigger a playground SearXNG and Crawl4AI request
- Confirm allowed paths appear in `/api/activity`
- Confirm low-priority paths do not appear
- Confirm playground failure modes return explicit errors instead of silent 500s
- Run `bun test`

---

## 6. Implementation Order

1. Define allowlist + persisted row contract
2. Add SQLite storage layer
3. Wire logger to SQLite persistence
4. Switch dashboard reads to SQLite
5. Harden playground routes
6. Add and run tests
7. Verify live behavior

---

## 7. Acceptance Criteria

- Request activity persists across restart via SQLite
- Only high-priority paths are saved
- Playground proxy no longer returns unexplained 500s for expected failure cases
- Dashboard endpoints still work
- Tests pass

---

## 8. Suggested Commit Sequence

1. `feat: define activity allowlist and sqlite contract`
2. `feat: persist request activity to sqlite`
3. `fix: harden playground proxy errors`
4. `test: cover activity persistence and proxy failures`
5. `docs: update plan and verification notes`

---

## 9. Notes for the Implementer

- Do not keep the old in-memory-only buffer as the source of truth once SQLite is working.
- If you need temporary compatibility, keep the in-memory buffer only as a short-lived bridge, not the final design.
- Prefer explicit, simple SQL over abstraction.
- The allowlist should be centralized in one file so the logger, store, and tests all agree.
