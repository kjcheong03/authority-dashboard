/* ───────────────────────────────────────────────────────────────────────────
 * COVID-19 weekly historical series, sourced from data.gov.sg collection 522
 * (MOH Weekly Infectious Disease Bulletin / COVID stats).
 *
 * Dates run from 2023-02-27 to 2024-02-19, week resolution. Authority Dashboard
 * uses this for the "COVID-19" hazard card — historical, browseable by date.
 * Live dengue stats are fetched separately via lib/datagovsg.ts.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface CovidWeek {
  date: string; // Monday of the epi-week (YYYY-MM-DD)
  cases: number; // estimated weekly infections
  seniorHosp: number; // avg daily hospitalised, age 60+
  seniorIcu: number; // avg daily ICU, age 60+
}

export const covidWeekly: CovidWeek[] = [
  { date: "2023-02-27", cases: 4426, seniorHosp: 34.9, seniorIcu: 2.3 },
  { date: "2023-03-06", cases: 10352, seniorHosp: 68.0, seniorIcu: 2.3 },
  { date: "2023-03-13", cases: 10464, seniorHosp: 104.3, seniorIcu: 3.7 },
  { date: "2023-03-20", cases: 14467, seniorHosp: 107.0, seniorIcu: 3.0 },
  { date: "2023-03-27", cases: 28410, seniorHosp: 153.4, seniorIcu: 1.1 },
  { date: "2023-04-03", cases: 16018, seniorHosp: 181.4, seniorIcu: 3.3 },
  { date: "2023-04-10", cases: 26072, seniorHosp: 223.3, seniorIcu: 2.4 },
  { date: "2023-04-17", cases: 27818, seniorHosp: 245.6, seniorIcu: 5.3 },
  { date: "2023-04-24", cases: 23157, seniorHosp: 255.3, seniorIcu: 4.4 },
  { date: "2023-05-01", cases: 22476, seniorHosp: 279.0, seniorIcu: 4.1 },
  { date: "2023-05-08", cases: 23531, seniorHosp: 285.1, seniorIcu: 6.3 },
  { date: "2023-05-15", cases: 20767, seniorHosp: 225.0, seniorIcu: 7.7 },
  { date: "2023-05-22", cases: 14851, seniorHosp: 184.3, seniorIcu: 7.4 },
  { date: "2023-05-29", cases: 8531, seniorHosp: 127.9, seniorIcu: 5.0 },
  { date: "2023-06-05", cases: 10432, seniorHosp: 111.4, seniorIcu: 2.7 },
  { date: "2023-06-12", cases: 6717, seniorHosp: 108.4, seniorIcu: 5.0 },
  { date: "2023-06-19", cases: 6882, seniorHosp: 80.0, seniorIcu: 4.4 },
  { date: "2023-06-26", cases: 4302, seniorHosp: 77.9, seniorIcu: 2.4 },
  { date: "2023-07-03", cases: 8544, seniorHosp: 80.4, seniorIcu: 0.6 },
  { date: "2023-07-10", cases: 5632, seniorHosp: 55.0, seniorIcu: 1.7 },
  { date: "2023-07-17", cases: 4738, seniorHosp: 49.0, seniorIcu: 0.9 },
  { date: "2023-07-24", cases: 4951, seniorHosp: 47.6, seniorIcu: 1.6 },
  { date: "2023-07-31", cases: 3485, seniorHosp: 44.6, seniorIcu: 2.6 },
  { date: "2023-08-07", cases: 4951, seniorHosp: 42.6, seniorIcu: 2.6 },
  { date: "2023-08-14", cases: 7045, seniorHosp: 49.3, seniorIcu: 1.4 },
  { date: "2023-08-21", cases: 6650, seniorHosp: 48.1, seniorIcu: 0.7 },
  { date: "2023-08-28", cases: 4295, seniorHosp: 59.3, seniorIcu: 0.0 },
  { date: "2023-09-04", cases: 7248, seniorHosp: 73.9, seniorIcu: 0.9 },
  { date: "2023-09-11", cases: 6401, seniorHosp: 63.0, seniorIcu: 1.4 },
  { date: "2023-09-18", cases: 14843, seniorHosp: 75.0, seniorIcu: 2.1 },
  { date: "2023-09-25", cases: 15336, seniorHosp: 95.3, seniorIcu: 1.9 },
  { date: "2023-10-02", cases: 16250, seniorHosp: 121.9, seniorIcu: 2.4 },
  { date: "2023-10-09", cases: 14801, seniorHosp: 116.9, seniorIcu: 1.3 },
  { date: "2023-10-16", cases: 17123, seniorHosp: 123.1, seniorIcu: 0.7 },
  { date: "2023-10-23", cases: 16062, seniorHosp: 114.9, seniorIcu: 0.6 },
  { date: "2023-10-30", cases: 16395, seniorHosp: 120.3, seniorIcu: 1.0 },
  { date: "2023-11-06", cases: 15441, seniorHosp: 102.4, seniorIcu: 2.4 },
  { date: "2023-11-13", cases: 10726, seniorHosp: 99.7, seniorIcu: 0.9 },
  { date: "2023-11-20", cases: 22094, seniorHosp: 115.0, seniorIcu: 1.3 },
  { date: "2023-11-27", cases: 32035, seniorHosp: 186.6, seniorIcu: 4.3 },
  { date: "2023-12-04", cases: 56043, seniorHosp: 294.0, seniorIcu: 7.6 },
  { date: "2023-12-11", cases: 58300, seniorHosp: 480.0, seniorIcu: 10.4 },
  { date: "2023-12-18", cases: 39100, seniorHosp: 460.0, seniorIcu: 16.7 },
  { date: "2023-12-25", cases: 21200, seniorHosp: 323.6, seniorIcu: 9.7 },
  { date: "2024-01-01", cases: 19800, seniorHosp: 172.7, seniorIcu: 5.0 },
  { date: "2024-01-08", cases: 12200, seniorHosp: 107.3, seniorIcu: 1.9 },
  { date: "2024-01-15", cases: 10700, seniorHosp: 73.4, seniorIcu: 3.9 },
  { date: "2024-01-22", cases: 5880, seniorHosp: 39.7, seniorIcu: 3.4 },
  { date: "2024-01-29", cases: 4370, seniorHosp: 27.7, seniorIcu: 1.6 },
  { date: "2024-02-05", cases: 3000, seniorHosp: 20.3, seniorIcu: 0.0 },
  { date: "2024-02-12", cases: 2040, seniorHosp: 12.6, seniorIcu: 0.0 },
  { date: "2024-02-19", cases: 2450, seniorHosp: 11.0, seniorIcu: 0.0 },
];

export const covidDateBounds = {
  min: covidWeekly[0].date,
  max: covidWeekly[covidWeekly.length - 1].date,
};

// Date the dashboard defaults to for COVID — aligned with the ORCA caregiver
// app's default (20 Nov 2023) so both surfaces open on the same week.
export const defaultCovidDate = "2023-11-20";

type Tier = "LOW" | "MONITOR" | "ELEVATED" | "HIGH";
type TrendDir = "rising" | "easing" | "steady";

export interface CovidStats {
  date: string;
  friendlyDate: string;
  cases: number;
  seniorHosp: number;
  seniorIcu: number;
  trendPct: number | null;
  trendDir: TrendDir;
  tier: Tier;
  tierColor: string;
}

function nearestIndex(t: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < covidWeekly.length; i++) {
    const d = Math.abs(Date.parse(covidWeekly[i].date) - t);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

const COVID_TIER_THRESHOLDS: [number, number, number] = [8000, 20000, 40000];

function tierOf(cases: number): Tier {
  const [a, b, c] = COVID_TIER_THRESHOLDS;
  if (cases >= c) return "HIGH";
  if (cases >= b) return "ELEVATED";
  if (cases >= a) return "MONITOR";
  return "LOW";
}

const TIER_COLOR: Record<Tier, string> = {
  LOW: "#16a34a",
  MONITOR: "#b45309",
  ELEVATED: "#dc2626",
  HIGH: "#991b1b",
};

function fmt(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function getCovidStats(dateStr: string): CovidStats {
  const t = Date.parse(dateStr + "T00:00:00");
  const idx = nearestIndex(t);
  const point = covidWeekly[idx];
  const prev = idx > 0 ? covidWeekly[idx - 1] : null;
  const tier = tierOf(point.cases);
  const trendPct = prev && prev.cases > 0 ? Math.round(((point.cases - prev.cases) / prev.cases) * 100) : null;
  // Tighter threshold than BrainHack (±2 instead of ±5) so meaningful week-over-week
  // movement actually shows as up/down rather than flat-lining at "steady".
  const trendDir: TrendDir = trendPct === null ? "steady" : trendPct > 2 ? "rising" : trendPct < -2 ? "easing" : "steady";
  return {
    date: point.date,
    friendlyDate: fmt(point.date),
    cases: point.cases,
    seniorHosp: Math.round(point.seniorHosp),
    seniorIcu: Math.round(point.seniorIcu),
    trendPct,
    trendDir,
    tier,
    tierColor: TIER_COLOR[tier],
  };
}
