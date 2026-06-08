/* ───────────────────────────────────────────────────────────────────────────
 * GDELT via BigQuery — the rate-limit-free path (GDELT's own recommendation).
 *
 * Queries the GKG (Global Knowledge Graph) for records mentioning the topic over
 * the last N days, computing: global volume/velocity, average TONE (which the
 * DOC API can't give cheaply), and the Singapore subset (V2Locations).
 *
 * Auth (any one of these works):
 *   - GCP_SA_KEY: the full service-account JSON pasted into a single env var.
 *     This is the path that works on Vercel (no filesystem / no gcloud).
 *   - GOOGLE_APPLICATION_CREDENTIALS: a key-file path (local dev).
 *   - gcloud user ADC (`gcloud auth application-default login`) + a project id.
 *
 * Cost-guarded with maximumBytesBilled + a short window so it stays inside the
 * 1 TB/month free tier. Returns null (caller falls back to the DOC API) if creds
 * are absent or the query fails.
 * ─────────────────────────────────────────────────────────────────────────── */

import type { SpreadSignal, VelocityLabel } from "./gdelt";
import { GDELT_WINDOW_DAYS } from "./types";

const WINDOW_DAYS = GDELT_WINDOW_DAYS;
const MAX_BYTES_BILLED = String(30 * 1024 ** 3); // 30 GB cap per query

// Service-account JSON passed inline (Vercel-friendly). Parsed once, lazily.
function inlineCreds(): { client_email: string; private_key: string; project_id?: string } | null {
  const raw = process.env.GCP_SA_KEY;
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j.client_email && j.private_key) return j;
  } catch {
    /* malformed JSON → ignore, fall back */
  }
  return null;
}

const PROJECT_ID =
  process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || inlineCreds()?.project_id || "";

export function bigQueryEnabled(): boolean {
  // Inline JSON key (Vercel), OR a key file, OR a project id (gcloud user ADC).
  return !!(inlineCreds() || process.env.GOOGLE_APPLICATION_CREDENTIALS || PROJECT_ID);
}

function velocityFromDays(dayCounts: Map<number, number>): VelocityLabel {
  const days = [...dayCounts.keys()].sort((a, b) => a - b);
  if (!days.length) return "MINIMAL";
  const cutoff = days[Math.max(0, days.length - 7)];
  let recent = 0,
    older = 0;
  for (const d of days) (d >= cutoff ? (recent += dayCounts.get(d)!) : (older += dayCounts.get(d)!));
  const v = older / (WINDOW_DAYS - 7) > 0 ? recent / 7 / (older / (WINDOW_DAYS - 7)) : recent > 0 ? 10 : 0;
  return v >= 3 ? "SURGING" : v >= 1.5 ? "RISING" : v >= 0.7 ? "STEADY" : v > 0 ? "DECLINING" : "MINIMAL";
}

function toneLabel(t: number): string {
  return t <= -5 ? "ALARMIST" : t <= -1.5 ? "NEGATIVE" : t < 2 ? "NEUTRAL" : "POSITIVE";
}

interface Row {
  day: number;
  tone: number | null;
  sg: boolean;
}

export async function querySpreadBigQuery(keyword: string, endDate?: string): Promise<SpreadSignal | null> {
  if (!bigQueryEnabled()) return null;
  try {
    const { BigQuery } = await import("@google-cloud/bigquery");
    const creds = inlineCreds();
    const bq = new BigQuery({
      ...(PROJECT_ID ? { projectId: PROJECT_ID } : {}),
      ...(creds ? { credentials: { client_email: creds.client_email, private_key: creds.private_key } } : {}),
    });
    const kw = `%${keyword.toLowerCase()}%`;

    // For historical queries (endDate in the past), anchor the WINDOW_DAYS-long
    // window to that date instead of NOW. Otherwise use the most recent window.
    const isHistorical = !!endDate && Date.parse(endDate) < Date.now() - 86400_000;
    const query = isHistorical
      ? `
      SELECT
        CAST(DATE / 1000000 AS INT64) AS day,
        SAFE_CAST(SPLIT(V2Tone, ',')[OFFSET(0)] AS FLOAT64) AS tone,
        REGEXP_CONTAINS(LOWER(IFNULL(V2Locations, '')), 'singapore') AS sg
      FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`
      WHERE _PARTITIONTIME BETWEEN TIMESTAMP_SUB(TIMESTAMP(@end_date), INTERVAL @days DAY) AND TIMESTAMP(@end_date)
        AND (LOWER(IFNULL(DocumentIdentifier, '')) LIKE @kw OR LOWER(IFNULL(AllNames, '')) LIKE @kw)`
      : `
      SELECT
        CAST(DATE / 1000000 AS INT64) AS day,
        SAFE_CAST(SPLIT(V2Tone, ',')[OFFSET(0)] AS FLOAT64) AS tone,
        REGEXP_CONTAINS(LOWER(IFNULL(V2Locations, '')), 'singapore') AS sg
      FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`
      WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
        AND (LOWER(IFNULL(DocumentIdentifier, '')) LIKE @kw OR LOWER(IFNULL(AllNames, '')) LIKE @kw)`;

    const [rows] = (await bq.query({
      query,
      params: isHistorical
        ? { days: WINDOW_DAYS, kw, end_date: `${endDate} 23:59:59` }
        : { days: WINDOW_DAYS, kw },
      maximumBytesBilled: MAX_BYTES_BILLED,
    })) as unknown as [Row[]];

    if (!rows.length) return null;

    const dayCounts = new Map<number, number>();
    const sgDayCounts = new Map<number, number>();
    const byDay = new Map<number, { global: number; sg: number; tSum: number; tN: number }>();
    let toneSum = 0,
      toneN = 0,
      sgCount = 0;

    for (const r of rows) {
      dayCounts.set(r.day, (dayCounts.get(r.day) ?? 0) + 1);
      const e = byDay.get(r.day) ?? { global: 0, sg: 0, tSum: 0, tN: 0 };
      e.global += 1;
      if (typeof r.tone === "number" && !Number.isNaN(r.tone)) {
        toneSum += r.tone;
        toneN += 1;
        e.tSum += r.tone;
        e.tN += 1;
      }
      if (r.sg) {
        sgCount += 1;
        e.sg += 1;
        sgDayCounts.set(r.day, (sgDayCounts.get(r.day) ?? 0) + 1);
      }
      byDay.set(r.day, e);
    }
    const avgTone = toneN ? toneSum / toneN : 0;

    const timeline = [...byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, v]) => {
        const s = String(day);
        return {
          date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
          global: v.global,
          sg: v.sg,
          tone: v.tN ? Math.round((v.tSum / v.tN) * 10) / 10 : undefined,
        };
      });

    return {
      velocityLabel: velocityFromDays(dayCounts),
      totalArticles: rows.length,
      topCountries: [],
      singaporeArticles: sgCount,
      singaporeVelocity: velocityFromDays(sgDayCounts),
      toneLabel: toneLabel(avgTone),
      avgTone: Math.round(avgTone * 10) / 10,
      source: "bigquery",
      timeline,
    };
  } catch {
    return null;
  }
}
