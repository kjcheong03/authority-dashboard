/* ───────────────────────────────────────────────────────────────────────────
 * GET /api/hazards/gdelt?topic=X[&refresh=1]
 *
 * Reads the per-topic GDELT spread from Supabase's hazard_gdelt cache so the
 * top hazard cards load instantly. If no cached row exists OR ?refresh=1 was
 * passed, hits BigQuery and upserts the result back into the cache.
 *
 * Response: { spread, fetched_at } | null
 * ─────────────────────────────────────────────────────────────────────────── */

import { getSpread } from "@/lib/spread";
import { getCachedGdelt, setCachedGdelt } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const topic = searchParams.get("topic")?.trim();
  const refresh = searchParams.get("refresh") === "1";
  // Optional ?date=YYYY-MM-DD anchors the GDELT coverage window to a historical date
  // (e.g. COVID-19 with the date picker on the hazard card).
  const date = searchParams.get("date")?.trim() || undefined;
  if (!topic) return Response.json(null);

  if (!refresh) {
    const cached = await getCachedGdelt(topic, date);
    if (cached) return Response.json(cached);
  }

  const spread = await getSpread(topic, date);
  if (!spread) return Response.json(null);
  await setCachedGdelt(topic, spread, date);
  return Response.json({ spread, fetched_at: new Date().toISOString() });
}
