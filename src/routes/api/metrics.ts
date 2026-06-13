import { getMetrics } from "../../stores/metrics-store.ts";

export async function handleMetrics(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const granularity = url.searchParams.get("granularity") as "1m" | "5m" | "15m" | "1h" | null;
  const validGranularity = granularity && ["1m", "5m", "15m", "1h"].includes(granularity) ? granularity : "5m";

  const metrics = getMetrics(validGranularity);
  return Response.json(metrics, { status: 200 });
}
