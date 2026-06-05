/* GET /api/tinyfish/screenshot?runId=X&stepId=Y
   Proxies a TinyFish step screenshot. Auth happens server-side so the
   X-API-Key never reaches the browser. */

import { fetchStepScreenshot } from "@/lib/tinyfish";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  const stepId = searchParams.get("stepId");
  if (!runId || !stepId) return new Response("Missing runId/stepId", { status: 400 });
  const upstream = await fetchStepScreenshot(runId, stepId);
  if (!upstream.ok) return new Response("Snapshot unavailable", { status: upstream.status });
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
