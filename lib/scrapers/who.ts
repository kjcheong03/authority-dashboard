// WHO (World Health Organization) verified-channel scraper.
// Hits the WHO site search and returns up to 8 result links pinned with
// agency: 'WHO'. Never throws — always returns { items, error? }.

import * as cheerio from "cheerio";
import type { Cheerio } from "cheerio";
import type { Scraper, ScrapedItem } from "./types";
import { fetchHtml, encodeTopic } from "./util";

const BASE = "https://www.who.int";
const MAX_ITEMS = 8;

function absolutize(href: string): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return "https:" + href;
  if (href.startsWith("/")) return BASE + href;
  return BASE + "/" + href;
}

const who: Scraper = async (topic) => {
  try {
    const url = `${BASE}/search?indexCatalogue=genericsearchindex1&searchQuery=${encodeTopic(topic)}`;
    const html = await fetchHtml(url);
    if (!html) return { items: [], error: "fetch failed" };

    const $ = cheerio.load(html);
    const items: ScrapedItem[] = [];
    const seen = new Set<string>();

    // WHO renders results inside .sf-list-vertical (modern layout) or
    // .search-list (legacy). Both wrap each hit in an <a> with a title and
    // an adjacent date node. We unify by walking anchors under either root.
    const containers = $(".sf-list-vertical, .search-list");

    const collectFromAnchor = (a: Cheerio<any>) => {
      if (items.length >= MAX_ITEMS) return;
      const href = (a.attr("href") || "").trim();
      // Heading element if present, otherwise raw anchor text.
      const titleNode = a.find(".heading, h3, h4, .sf-result-title").first();
      const rawTitle = (titleNode.length ? titleNode.text() : a.text()) || "";
      const title = rawTitle.replace(/\s+/g, " ").trim();
      if (!title || !href) return;
      const abs = absolutize(href);
      if (!abs) return;
      if (seen.has(abs)) return;
      seen.add(abs);

      // Date often lives in a sibling/descendant with class .timestamp or
      // .date — fall back to any short date-looking text near the anchor.
      const dateNode = a
        .find(".timestamp, .date, .sf-meta-date, time")
        .first();
      const date = dateNode.length
        ? dateNode.text().replace(/\s+/g, " ").trim()
        : undefined;

      items.push({
        text: title,
        url: abs,
        agency: "WHO",
        ...(date ? { timeAgo: date } : {}),
      });
    };

    if (containers.length) {
      containers.find("a").each((_i, el) => {
        collectFromAnchor($(el));
      });
    }

    // Fallback: some WHO search responses render hits as plain <a class="link-container">
    // outside the named containers — sweep those if we still came up short.
    if (items.length < MAX_ITEMS) {
      $("a.link-container, a.sf-list-item").each((_i, el) => {
        collectFromAnchor($(el));
      });
    }

    return { items: items.slice(0, MAX_ITEMS) };
  } catch (e) {
    return {
      items: [],
      error: e instanceof Error ? e.message : "unknown error",
    };
  }
};

export default who;
