import { queryActivity } from "../../stores/activity-store.ts";
import type { ActivityQuery } from "../../types/dashboard.ts";

export async function handleActivity(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const method = url.searchParams.get("method") ?? undefined;
  const path = url.searchParams.get("path") ?? undefined;
  const statusParam = url.searchParams.get("status");
  const startTime = url.searchParams.get("startTime") ?? undefined;
  const endTime = url.searchParams.get("endTime") ?? undefined;
  const pageParam = url.searchParams.get("page");
  const limitParam = url.searchParams.get("limit");

  const query: ActivityQuery = {};

  if (search) query.search = search;
  if (method) query.method = method;
  if (path) query.path = path;
  if (statusParam !== null) {
    const parsed = Number(statusParam);
    if (!Number.isNaN(parsed)) query.status = parsed;
  }
  if (startTime) query.startTime = startTime;
  if (endTime) query.endTime = endTime;
  if (pageParam !== null) {
    const parsed = Number(pageParam);
    if (!Number.isNaN(parsed)) query.page = parsed;
  }
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isNaN(parsed)) query.limit = parsed;
  }

  const result = queryActivity(query);
  return Response.json(result, { status: 200 });
}
