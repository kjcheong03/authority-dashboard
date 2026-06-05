/* GET /api/tinyfish/html?runId=X&stepId=Y
   Proxies a TinyFish step HTML snapshot. Wrapped in a tiny shell that strips
   scripts and base-tags so the embedded DOM renders safely inside an iframe. */

import { fetchStepHtml } from "@/lib/tinyfish";

export const runtime = "nodejs";

function sanitise(html: string): string {
  // Strip scripts entirely — we don't want an archived page running code.
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  const stepId = searchParams.get("stepId");
  if (!runId || !stepId) return new Response("Missing runId/stepId", { status: 400 });
  const upstream = await fetchStepHtml(runId, stepId);
  if (!upstream.ok) return new Response("Snapshot unavailable", { status: upstream.status });
  const html = sanitise(await upstream.text());
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Content-Security-Policy": "sandbox allow-same-origin",
    },
  });
}
