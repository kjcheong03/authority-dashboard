/**
 * Scraper type contract.
 *
 * Every channel scraper (verified or online) is a function that takes a topic
 * string and resolves to a ScrapeResult. Scrapers MUST NOT throw — on failure
 * they return { items: [], error: "..." } so the dispatcher can continue and
 * top up results via the OpenAI fallback.
 *
 * Field conventions:
 *   - Verified channels (MOH, NEA, WHO, CDC, HealthHub) populate `agency`
 *     with the display name.
 *   - Online channels (Reddit, HardwareZone, Mothership, Telegram, TikTok,
 *     Facebook, DuckDuckGo) populate `where` with the display name.
 *   - `stat`, `shares`, and `timeAgo` are optional surface metadata used by
 *     the UI when available.
 *
 * Minimum-result enforcement (verified >= 3, online >= 5, online capped at 10)
 * is handled by the dispatcher, not by individual scrapers.
 */

interface ScrapedItem {
  text: string;
  url?: string;
  stat?: string;
  agency?: string;
  where?: string;
  shares?: string;
  timeAgo?: string;
}

interface ScrapeResult {
  items: ScrapedItem[];
  error?: string;
}

type Scraper = (topic: string) => Promise<ScrapeResult>;

export type { ScrapedItem, ScrapeResult, Scraper };
