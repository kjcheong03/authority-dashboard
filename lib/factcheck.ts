/* ───────────────────────────────────────────────────────────────────────────
 * Google Fact Check Tools API — corroborating, published fact-checks.
 *
 * For a flagged claim, returns existing professional fact-checks (ClaimReview):
 * who reviewed it, their rating ("False" / "Misleading"), and a link. This turns
 * CARA's own classification into authoritatively corroborated misinformation.
 *
 * Needs a free Google Cloud API key in GOOGLE_FACTCHECK_API_KEY. Degrades to []
 * when absent or on error.
 * ─────────────────────────────────────────────────────────────────────────── */

const KEY = process.env.GOOGLE_FACTCHECK_API_KEY;

export interface FactCheckHit {
  publisher: string;
  rating: string; // textual rating, e.g. "False", "Misleading"
  title: string;
  url: string;
  reviewedClaim?: string;
}

interface ApiClaim {
  text?: string;
  claimReview?: Array<{
    publisher?: { name?: string; site?: string };
    url?: string;
    title?: string;
    textualRating?: string;
  }>;
}

export function factCheckEnabled(): boolean {
  return !!KEY;
}

export async function searchFactChecks(query: string, max = 3): Promise<FactCheckHit[]> {
  if (!KEY || !query.trim()) return [];
  try {
    const url =
      `https://factchecktools.googleapis.com/v1alpha1/claims:search` +
      `?query=${encodeURIComponent(query)}&languageCode=en&pageSize=${max}&key=${KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { claims?: ApiClaim[] };
    const hits: FactCheckHit[] = [];
    for (const c of data.claims ?? []) {
      for (const r of c.claimReview ?? []) {
        if (!r.url) continue;
        hits.push({
          publisher: r.publisher?.name ?? r.publisher?.site ?? "Fact-checker",
          rating: r.textualRating ?? "Reviewed",
          title: r.title ?? c.text ?? "",
          url: r.url,
          reviewedClaim: c.text,
        });
        if (hits.length >= max) return hits;
      }
    }
    return hits;
  } catch {
    return [];
  }
}
