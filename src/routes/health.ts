/* ------------------------------------------------------------------
   GET /v2/health — liveness check
   ------------------------------------------------------------------ */

export function healthHandler(_req: Request): Response {
  return Response.json({ status: "ok" }, { status: 200 });
}
