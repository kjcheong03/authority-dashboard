/* ───────────────────────────────────────────────────────────────────────────
 * Surveillance-grid channel definitions.
 *
 * Each entry is one tile in the live scan panel. Browser-type channels would
 * each run their own TinyFish session when parallel scraping is wired in;
 * data-type channels render data visualizations (data.gov.sg, GDELT).
 *
 * Lanes:
 *   - official: trusted authority sources (Phase 1 - ingest)
 *   - social:   community channels + media velocity (Phase 2 - misinfo)
 * ─────────────────────────────────────────────────────────────────────────── */

export type Lane = "official" | "social";
export type TileType = "browser" | "data";

export interface Channel {
  id: string;
  name: string;
  domain: string; // used by Google's favicon service for source logos
  lane: Lane;
  type: TileType;
  // Optional override when the site's favicon doesn't match the recognizable
  // brand logo (e.g., CDC's striped logo isn't their current favicon).
  logoUrl?: string;
}

export const CHANNELS: Channel[] = [
  // ── Official lane (Phase 1) ────────────────────────────────────────
  { id: "moh",        name: "MOH",          domain: "moh.gov.sg",          lane: "official", type: "browser" },
  { id: "nea",        name: "NEA",          domain: "nea.gov.sg",          lane: "official", type: "browser" },
  { id: "who",        name: "WHO",          domain: "who.int",             lane: "official", type: "browser" },
  { id: "cdc",        name: "CDC",          domain: "cdc.gov",             lane: "official", type: "browser" },
  { id: "healthhub",  name: "HealthHub",    domain: "healthhub.sg",        lane: "official", type: "browser" },

  // ── Social & media lane (Phase 2) ──────────────────────────────────
  { id: "reddit",     name: "Reddit",       domain: "reddit.com",          lane: "social",   type: "browser" },
  { id: "hwz",        name: "HardwareZone", domain: "hardwarezone.com.sg", lane: "social",   type: "browser" },
  { id: "mothership", name: "Mothership",   domain: "mothership.sg",       lane: "social",   type: "browser" },
  { id: "telegram",   name: "Telegram",     domain: "telegram.org",        lane: "social",   type: "browser" },
  { id: "facebook",   name: "Facebook",     domain: "facebook.com",        lane: "social",   type: "browser" },
  { id: "ddg",        name: "DuckDuckGo",   domain: "duckduckgo.com",      lane: "social",   type: "browser" },
];

export const OFFICIAL_CHANNELS = CHANNELS.filter((c) => c.lane === "official");
export const SOCIAL_CHANNELS = CHANNELS.filter((c) => c.lane === "social");

export const faviconUrl = (domain: string, size = 64) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;

// ── Attribution helpers ───────────────────────────────────────────────────
// Map a finding's `agency` (e.g., "MOH", "data.gov.sg") or a claim's `where`
// (e.g., "Reddit", "r/singapore", "Telegram") back to its channel definition so
// the UI can render the proper logo + tier in the source-picker modal.

const aliasToOfficial: Record<string, string> = {
  moh: "moh", nea: "nea", who: "who", cdc: "cdc",
  healthhub: "healthhub", "health hub": "healthhub", hpb: "healthhub",
  "data.gov.sg": "datagovsg", datagovsg: "datagovsg", "data gov sg": "datagovsg",
};

const aliasToSocial: Record<string, string> = {
  reddit: "reddit", "r/singapore": "reddit",
  hardwarezone: "hwz", hwz: "hwz",
  mothership: "mothership",
  telegram: "telegram", whatsapp: "telegram", "messaging app": "telegram",
  facebook: "facebook", fb: "facebook",
  duckduckgo: "ddg", ddg: "ddg",
};

export function channelForAgency(agency: string | undefined | null): Channel | undefined {
  if (!agency) return undefined;
  const a = agency.toLowerCase().trim();
  const id = aliasToOfficial[a];
  if (id) return OFFICIAL_CHANNELS.find((c) => c.id === id);
  return OFFICIAL_CHANNELS.find((c) => c.name.toLowerCase() === a || c.id === a);
}

export function channelForWhere(where: string | undefined | null): Channel | undefined {
  if (!where) return undefined;
  const w = where.toLowerCase().trim();
  // Try direct alias match first
  for (const key of Object.keys(aliasToSocial)) {
    if (w.includes(key)) return SOCIAL_CHANNELS.find((c) => c.id === aliasToSocial[key]);
  }
  // Fallback: try channel name match
  return SOCIAL_CHANNELS.find((c) => w.includes(c.name.toLowerCase()) || w.includes(c.id));
}
