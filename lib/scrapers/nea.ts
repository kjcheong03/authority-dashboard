// NEA media/news scraper.
// Pulls article cards from the public NEA news listing and filters to
// items whose title text mentions the topic. The listing appears to be
// largely server-rendered but the markup is not perfectly stable, so we
// try several selector strategies and fall back to any anchor that points
// at /media/news/<slug>.

import * as cheerio from "cheerio";
import type { Scraper, ScrapedItem } from "./types";
import { fetchHtml } from "./util";

const BASE = "https://www.nea.gov.sg";
const LISTING = `${BASE}/media/news`;

function absolutize(href: string): string {
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${BASE}${href}`;
  return `${BASE}/${href}`;
}

function cleanText(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

// NEA article URLs look like /media/news/<slug-or-id>. We use this both as
// a selector (anchors with that href prefix) and as a sanity-check when
// promoting fallback anchors into the result set.
function isNewsArticleHref(href: string): boolean {
  if (!href) return false;
  // Avoid matching the listing root itself.
  if (/\/media\/news\/?$/.test(href)) return false;
  return /\/media\/news\//.test(href);
}

const nea: Scraper = async (topic) => {
  try {
    const html = await fetchHtml(LISTING);
    if (!html) {
      return { items: [], error: "fetchHtml returned null for NEA listing" };
    }

    const $ = cheerio.load(html);
    const needle = cleanText(topic).toLowerCase();

    // Collect raw candidates from a few selector strategies, dedupe by URL.
    type Candidate = { title: string; url: string; date: string };
    const seen = new Set<string>();
    const candidates: Candidate[] = [];

    const pushCandidate = (title: string, href: string, date: string) => {
      const url = absolutize(href);
      const cleanTitle = cleanText(title);
      if (!cleanTitle || !url) return;
      if (!isNewsArticleHref(url) && !isNewsArticleHref(href)) return;
      if (seen.has(url)) return;
      seen.add(url);
      candidates.push({ title: cleanTitle, url, date: cleanText(date) });
    };

    // Strategy 1: documented listing container.
    $(".media-news-listing article, article.media-news").each((_, el) => {
      const $el = $(el);
      const $a = $el.find("a[href]").first();
      const href = $a.attr("href") ?? "";
      const title =
        cleanText($el.find("h1, h2, h3, h4, .title").first().text()) ||
        cleanText($a.text());
      // Try common date holders inside the card.
      const date =
        cleanText($el.find("time").first().attr("datetime") ?? "") ||
        cleanText($el.find("time, .date, .news-date, .meta-date").first().text());
      pushCandidate(title, href, date);
    });

    // Strategy 2: any anchor that links to /media/news/<slug>. This is the
    // most resilient fallback when the listing markup shifts.
    $("a[href*='/media/news/']").each((_, el) => {
      const $a = $(el);
      const href = $a.attr("href") ?? "";
      if (!isNewsArticleHref(href)) return;
      const title =
        cleanText($a.attr("title")) ||
        cleanText($a.text()) ||
        cleanText($a.find("h1, h2, h3, h4").first().text());
      // Look for a sibling/parent date hint.
      const $card = $a.closest("article, li, .card, .item, .news-item, div");
      const date =
        cleanText($card.find("time").first().attr("datetime") ?? "") ||
        cleanText(
          $card.find("time, .date, .news-date, .meta-date").first().text(),
        );
      pushCandidate(title, href, date);
    });

    // Topic filter: case-insensitive substring against title. If the topic
    // is empty, keep everything.
    const filtered = needle
      ? candidates.filter((c) => c.title.toLowerCase().includes(needle))
      : candidates;

    const items: ScrapedItem[] = filtered.slice(0, 8).map((c) => ({
      text: c.title,
      url: c.url,
      agency: "NEA",
      timeAgo: c.date || undefined,
    }));

    return { items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { items: [], error: `nea scraper failed: ${msg}` };
  }
};

export default nea;
