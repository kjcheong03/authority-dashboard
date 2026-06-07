// MOH (Ministry of Health, Singapore) press release scraper.
// Source: https://www.moh.gov.sg/news-highlights (server-rendered listing).
// Strategy: pull anchors that point at /news-highlights/<slug>, harvest
// title + date from the surrounding card, then filter by topic.

import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Scraper, ScrapedItem } from "./types";
import { fetchHtml } from "./util";

const BASE_URL = "https://www.moh.gov.sg";
const LISTING_URL = "https://www.moh.gov.sg/news-highlights";
const AGENCY = "MOH";
const MAX_ITEMS = 8;

// Anchors we want to ignore — these appear inside /news-highlights/ as
// category filters or pagination links, not actual press releases.
const NAV_TEXT_BLOCKLIST = new Set<string>([
  "news highlights",
  "press releases",
  "speeches",
  "parliamentary qas",
  "forum replies",
  "highlights",
  "next",
  "previous",
  "more",
  "read more",
  "view all",
]);

function absolutize(href: string): string {
  if (!href) return "";
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return `${BASE_URL}${href}`;
  return `${BASE_URL}/${href}`;
}

function topicMatches(title: string, topic: string): boolean {
  const t = title.toLowerCase();
  const needle = topic.trim().toLowerCase();
  if (!needle) return true;
  if (t.includes(needle)) return true;
  // Any word longer than 3 chars in the topic counts as a hit.
  const words = needle.split(/\s+/).filter((w) => w.length > 3);
  return words.some((w) => t.includes(w));
}

// Look up the closest enclosing card/listing element from an anchor and try
// to find a date string within it. MOH typically renders dates as plain text
// near the title (e.g. "12 Mar 2025"). We accept anything that looks like a
// date — fail soft otherwise.
function extractDate($: CheerioAPI, anchor: Cheerio<any>): string | undefined {
  const card = anchor.closest(
    ".sf_listItem, article, li, .news-card, .listing-item, div",
  );
  if (!card || card.length === 0) return undefined;
  const text = card.text().replace(/\s+/g, " ").trim();
  // Match patterns like "12 Mar 2025", "12 March 2025", "2025-03-12", "12/03/2025".
  const m =
    text.match(
      /\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i,
    ) ||
    text.match(/\b\d{4}-\d{2}-\d{2}\b/) ||
    text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/);
  return m ? m[0] : undefined;
}

const moh: Scraper = async (topic) => {
  try {
    const html = await fetchHtml(LISTING_URL);
    if (!html) {
      return { items: [], error: "moh: fetch failed" };
    }

    const $ = cheerio.load(html);

    // Try the documented selectors first, then fall back to anchor sweep.
    const candidateAnchors: Cheerio<any>[] = [];
    const primary = $(".sf_listItem a, .news-highlights-listing > article a");
    if (primary.length > 0) {
      primary.each((_, el) => {
        candidateAnchors.push($(el));
      });
    } else {
      // Fallback: any anchor whose href points into /news-highlights/<slug>.
      $("a[href*='/news-highlights/']").each((_, el) => {
        candidateAnchors.push($(el));
      });
    }

    const seen = new Set<string>();
    const items: ScrapedItem[] = [];

    for (const a of candidateAnchors) {
      if (items.length >= MAX_ITEMS) break;

      const href = (a.attr("href") || "").trim();
      if (!href) continue;
      // Must look like an actual press-release URL, not the listing root.
      if (!/\/news-highlights\/.+/i.test(href)) continue;

      const title = a.text().replace(/\s+/g, " ").trim();
      if (!title) continue;
      if (NAV_TEXT_BLOCKLIST.has(title.toLowerCase())) continue;
      // Skip very short anchors (likely icons or "Read more" buttons).
      if (title.length < 8) continue;

      const url = absolutize(href);
      if (seen.has(url)) continue;
      seen.add(url);

      if (!topicMatches(title, topic)) continue;

      const date = extractDate($, a);

      const item: ScrapedItem = {
        text: title,
        url,
        agency: AGENCY,
      };
      if (date) item.timeAgo = date;
      items.push(item);
    }

    return { items };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { items: [], error: `moh: ${msg}` };
  }
};

export default moh;
