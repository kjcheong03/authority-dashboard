/* ───────────────────────────────────────────────────────────────────────────
 * data.gov.sg — official Singapore open data. Reliable REST API, no key.
 *
 * We use the LIVE NEA Dengue Clusters GeoJSON (updated continuously) as an
 * authoritative ground-truth source for dengue topics. Each cluster carries a
 * locality, case size, and breeding-habitat info.
 *
 * (The weekly-case / infectious-disease-bulletin datasets on data.gov.sg are
 * historical — they end in 2018/2022 — so we deliberately do not present them
 * as current figures.)
 * ─────────────────────────────────────────────────────────────────────────── */

const UA = "ORCA-AuthorityHub/1.0";
const DENGUE_CLUSTERS_DATASET = "d_dbfabf16158d1b0e1c420627c0819168";

export interface DengueClusters {
  totalClusters: number;
  totalCases: number;
  largest: { locality: string; cases: number } | null;
  topLocalities: { locality: string; cases: number }[];
  habitats: string[];
  updated: string | null; // ISO-ish date the data was last refreshed
}

interface ClusterProps {
  LOCALITY?: string;
  CASE_SIZE?: number;
  HOMES?: string;
  FMEL_UPD_D?: string; // "20260522155552"
}

/** Resolve a data.gov.sg dataset to its temporary download URL, then fetch it. */
async function downloadDataset<T>(datasetId: string): Promise<T | null> {
  try {
    const poll = await fetch(`https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}/poll-download`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!poll.ok) return null;
    const url = ((await poll.json()) as { data?: { url?: string } }).data?.url;
    if (!url) return null;
    const file = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!file.ok) return null;
    return (await file.json()) as T;
  } catch {
    return null;
  }
}

function fmtDate(raw?: string): string | null {
  if (!raw || raw.length < 8) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

export async function fetchDengueClusters(): Promise<DengueClusters | null> {
  const gj = await downloadDataset<{ features?: { properties?: ClusterProps }[] }>(DENGUE_CLUSTERS_DATASET);
  const feats = gj?.features ?? [];
  if (!feats.length) return null;

  const clusters = feats
    .map((f) => f.properties ?? {})
    .map((p) => ({ locality: p.LOCALITY ?? "Unknown", cases: Number(p.CASE_SIZE ?? 0), homes: p.HOMES ?? "", updated: p.FMEL_UPD_D }));

  const totalCases = clusters.reduce((s, c) => s + c.cases, 0);
  const sorted = [...clusters].sort((a, b) => b.cases - a.cases);
  const habitats = Array.from(
    new Set(
      clusters
        .flatMap((c) => c.homes.split(/,\s*/))
        .map((h) => h.trim())
        .filter(Boolean),
    ),
  ).slice(0, 5);

  return {
    totalClusters: clusters.length,
    totalCases,
    largest: sorted[0] ? { locality: sorted[0].locality, cases: sorted[0].cases } : null,
    topLocalities: sorted.slice(0, 3).map((c) => ({ locality: c.locality, cases: c.cases })),
    habitats,
    updated: fmtDate(clusters.find((c) => c.updated)?.updated),
  };
}
