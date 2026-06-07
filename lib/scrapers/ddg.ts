// DuckDuckGo HTML scraper.
// Targets the no-JS endpoint at html.duckduckgo.com which renders results as
// .result blocks — each containing a title anchor (.result__a) and a snippet
// (.result__snippet). The href on .result__a is usually wrapped as
// "/l/?uddg=<encoded-target-url>" so we decode it when present.

import * as cheerio from "cheerio";
import type { Scraper, ScrapedItem } from "./types";
import { fetchHtml, encodeTopic } from "./util";

const WHERE = "DuckDuckGo";
const MAX_ITEMS = 10;

// Unwrap DDG's redirect URLs (e.g. "//duckduckgo.com/l/?uddg=https%3A%2F%2F...").
function unwrapHref(href: string): string {
  if (!href) return href;
  try {
    // DDG sometimes returns protocol-relative URLs; normalize for URL parsing.
    const normalized = href.startsWith("//") ? "https:" + href : href;
    const u = new URL(
      normalized,
      normalized.startsWith("http") ? undefined : "https://duckduckgo.com",
    );
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return u.toString();
  } catch {
    return href;
  }
}

const ddg: Scraper = async (topic) => {
  try {
    const query = `${encodeTopic(topic)}+singapore+(rumour+OR+myth+OR+fake+OR+hoax)`;
    const url = `https://html.duckduckgo.com/html/?q=${query}`;
    const html = await fetchHtml(url);
    if (!html) return { items: [], error: "fetch failed" };

    const $ = cheerio.load(html);
    const items: ScrapedItem[] = [];

    $(".result").each((_, el) => {
      if (items.length >= MAX_ITEMS) return false;
      const $el = $(el);
      const titleAnchor = $el.find(".result__a").first();
      const title = titleAnchor.text().trim();
      const snippet = $el.find(".result__snippet").first().text().trim();
      if (!title && !snippet) return;

      const rawHref = titleAnchor.attr("href") || "";
      const href = unwrapHref(rawHref);

      const text = title && snippet ? `${title} — ${snippet}` : title || snippet;
      const item: ScrapedItem = { text, where: WHERE };
      if (href) item.url = href;
      items.push(item);
      return;
    });

    return { items };
  } catch (e) {
    return {
      items: [],
      error: e instanceof Error ? e.message : "ddg scrape failed",
    };
  }
};

export default ddg;
