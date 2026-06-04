/* ───────────────────────────────────────────────────────────────────────────
 * Unified "claim spread" selector. Prefers GDELT-on-BigQuery (reliable, adds
 * tone) when credentials are configured; otherwise uses the DOC 2.0 API. Either
 * way, falls back gracefully so the pipeline never breaks.
 * ─────────────────────────────────────────────────────────────────────────── */

import { querySpread, type SpreadSignal } from "./gdelt";
import { querySpreadBigQuery, bigQueryEnabled } from "./gdeltBigQuery";

export async function getSpread(keyword: string, endDate?: string): Promise<SpreadSignal | null> {
  // Historical queries (endDate in the past) require BigQuery — DOC API doesn't
  // give reliable historical windows. For "current" (no endDate) we prefer
  // BigQuery for the tone signal, falling back to DOC.
  if (bigQueryEnabled()) {
    const bq = await querySpreadBigQuery(keyword, endDate);
    if (bq) return bq;
  }
  if (endDate) return null; // No historical fallback available.
  return querySpread(keyword); // DOC API (+ its own cache fallback)
}
