/* ───────────────────────────────────────────────────────────────────────────
 * Unified "claim spread" selector. Prefers GDELT-on-BigQuery (reliable, adds
 * tone) when credentials are configured; otherwise uses the DOC 2.0 API. Either
 * way, falls back gracefully so the pipeline never breaks.
 * ─────────────────────────────────────────────────────────────────────────── */

import { querySpread, type SpreadSignal } from "./gdelt";
import { querySpreadBigQuery, bigQueryEnabled } from "./gdeltBigQuery";

export async function getSpread(keyword: string): Promise<SpreadSignal | null> {
  if (bigQueryEnabled()) {
    const bq = await querySpreadBigQuery(keyword);
    if (bq) return bq;
  }
  return querySpread(keyword); // DOC API (+ its own cache fallback)
}
