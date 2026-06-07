// HealthHub (SG) verified-channel scraper.
//
// Hits the public article search endpoint and parses any server-rendered
// result cards. HealthHub's frontend is largely client-rendered, so when the
// raw HTML has no usable results we surface a soft error so the dispatcher
// can top up via the OpenAI fallback.

import * as cheerio from "cheerio";
import type { Scraper, ScrapedItem } from "./types";
import { fetchHtml, encodeTopic } from "./util";

const BASE = "https://www.healthhub.sg";
const MAX_ITEMS = 8;

function absolutize(href: string | undefined): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${BASE}${trimmed}`;
  return `${BASE}/${trimmed}`;
}

function clean(text: string | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

const healthhub: Scraper = async (topic) => {
  const url = `${BASE}/search?q=${encodeTopic(topic)}`;

  try {
    const html = await fetchHtml(url);
    if (!html) {
      return { items: [], error: "fetch failed" };
    }

    const $ = cheerio.load(html);

    // HealthHub search UI uses a few possible card containers depending on
    // template version. We try the most common ones in order and stop at the
    // first selector that yields anything.
    const selectors = [
      ".search-results .result",
      ".search-results .search-result",
      ".search-result",
      ".result-item",
      ".article-card",
      "article",
    ];

    const items: ScrapedItem[] = [];
    const seen = new Set<string>();

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        if (items.length >= MAX_ITEMS) return false;
        const $el = $(el);
        // Prefer an explicit title anchor; fall back to the first link.
        const $title =
          $el.find("h1 a, h2 a, h3 a, h4 a, .title a, a.title").first();
        const $anchor = $title.length ? $title : $el.find("a").first();
        const text = clean($anchor.text() || $el.find("h1,h2,h3,h4").first().text());
        const href = absolutize($anchor.attr("href"));
        if (!text || text.length < 4) return;
        const key = (href || text).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ text, url: href, agency: "HealthHub" });
      });
      if (items.length > 0) break;
    }

    if (items.length === 0) {
      return { items: [], error: "JS-rendered, falls back to OpenAI" };
    }

    return { items: items.slice(0, MAX_ITEMS) };
  } catch {
    return { items: [], error: "scrape failed" };
  }
};

export default healthhub;
