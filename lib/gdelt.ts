/* ───────────────────────────────────────────────────────────────────────────
 * GDELT DOC 2.0 — free, live "claim spread" intelligence.
 *
 * Proper usage per GDELT docs:
 *  - Rate limit is ONE request every 5 seconds → calls are SEQUENTIAL & SPACED
 *    (never parallel, which was the original bug that produced 429s).
 *  - Country filtering uses the 2-char FIPS code, so Singapore = `sourcecountry:SN`
 *    rather than matching the country name in results.
 *  - We send a descriptive User-Agent, back off once on 429, and cache the last
 *    good result per keyword so a transient block degrades to recent real numbers.
 * ─────────────────────────────────────────────────────────────────────────── */

import { GDELT_WINDOW_DAYS } from "./types";

export type VelocityLabel = "SURGING" | "RISING" | "STEADY" | "DECLINING" | "MINIMAL";

export interface SpreadSignal {
  velocityLabel: VelocityLabel; // global velocity
  totalArticles: number; // global article count (sampled)
  topCountries: string[]; // global top source countries
  singaporeArticles: number; // Singapore-sourced article count (sourcecountry:SN)
  singaporeVelocity: VelocityLabel; // velocity of Singapore-sourced coverage
  toneLabel?: string; // ALARMIST / NEGATIVE / NEUTRAL / POSITIVE (BigQuery only)
  avgTone?: number;
  source?: "bigquery" | "doc";
  timeline?: { date: string; global: number; sg: number; tone?: number }[];
}

interface Article {
  seendate?: string;
  sourcecountry?: string;
}

const UA = "ORCA-AuthorityHub/1.0 (public-health research demo)";
const SPACING_MS = 5500; // honour the 1-request-per-5-seconds rule
const CACHE_MS = 30 * 60 * 1000; // reuse a good result for 30 min on failure
const cache = new Map<string, { at: number; sig: SpreadSignal }>();

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One DOC 2.0 ArtList request, with a 429 back-off retry. */
async function gdeltFetch(query: string, retried = false): Promise<Article[] | null> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=250&format=json&timespan=${GDELT_WINDOW_DAYS}d`;
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ac.signal });
    clearTimeout(timeout);
    if (res.status === 429 && !retried) {
      await sleep(SPACING_MS);
      return gdeltFetch(query, true);
    }
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith("{")) return null; // GDELT returns plain-text errors
    return (JSON.parse(text) as { articles?: Article[] }).articles ?? [];
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function velocityOf(articles: Article[]): VelocityLabel {
  const dateCounts: Record<string, number> = {};
  for (const a of articles) {
    const d = a.seendate?.slice(0, 8);
    if (d?.length === 8) dateCounts[d] = (dateCounts[d] ?? 0) + 1;
  }
  const dates = Object.keys(dateCounts).sort();
  if (!dates.length) return "MINIMAL";
  const cutoff = dates[Math.max(0, dates.length - 7)];
  let recent = 0,
    older = 0;
  for (const d of dates) (d >= cutoff ? (recent += dateCounts[d]) : (older += dateCounts[d]));
  const olderDays = GDELT_WINDOW_DAYS - 7;
  const v = older / olderDays > 0 ? recent / 7 / (older / olderDays) : recent > 0 ? 10 : 0;
  return v >= 3 ? "SURGING" : v >= 1.5 ? "RISING" : v >= 0.7 ? "STEADY" : v > 0 ? "DECLINING" : "MINIMAL";
}

export async function querySpread(keyword: string): Promise<SpreadSignal | null> {
  // 1) Global coverage.
  const global = await gdeltFetch(keyword);
  if (!global || !global.length) {
    const c = cache.get(keyword);
    return c && Date.now() - c.at < CACHE_MS ? c.sig : null; // fall back to recent good data
  }

  const countryCounts: Record<string, number> = {};
  for (const a of global) if (a.sourcecountry) countryCounts[a.sourcecountry] = (countryCounts[a.sourcecountry] ?? 0) + 1;
  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => c);

  // 2) Singapore-sourced coverage — spaced out, proper FIPS filter (SN).
  await sleep(SPACING_MS);
  const sg = await gdeltFetch(`${keyword} sourcecountry:SN`);
  // If the SG call is blocked, fall back to deriving SG from the global sample.
  const sgArticles = sg ?? global.filter((a) => (a.sourcecountry ?? "").toLowerCase().includes("singapore"));

  // Daily timeline (global + Singapore counts) for trend charts.
  const dayKey = (a: Article) => {
    const d = a.seendate?.slice(0, 8);
    return d?.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null;
  };
  const byDay = new Map<string, { global: number; sg: number }>();
  for (const a of global) {
    const k = dayKey(a);
    if (!k) continue;
    const e = byDay.get(k) ?? { global: 0, sg: 0 };
    e.global += 1;
    byDay.set(k, e);
  }
  for (const a of sgArticles) {
    const k = dayKey(a);
    if (!k) continue;
    const e = byDay.get(k) ?? { global: 0, sg: 0 };
    e.sg += 1;
    byDay.set(k, e);
  }
  const timeline = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));

  const sig: SpreadSignal = {
    velocityLabel: velocityOf(global),
    totalArticles: global.length,
    topCountries,
    singaporeArticles: sgArticles.length,
    singaporeVelocity: velocityOf(sgArticles),
    source: "doc",
    timeline,
  };
  cache.set(keyword, { at: Date.now(), sig });
  return sig;
}
