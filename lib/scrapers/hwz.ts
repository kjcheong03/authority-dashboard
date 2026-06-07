// HardwareZone (XenForo) forum search scraper.
// Lane: online. Pins `where: 'HardwareZone'` on every returned item.
// Never throws — on any failure returns { items: [], error: "..." }.

import * as cheerio from "cheerio";
import type { Scraper, ScrapedItem } from "./types";
import { fetchHtml, encodeTopic } from "./util";

const BASE = "https://forums.hardwarezone.com.sg";
const WHERE = "HardwareZone";

// Absolutize a relative XenForo href against the forum base URL.
function absolutize(href: string): string {
  if (!href) return BASE;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith("/")) return BASE + href;
  return BASE + "/" + href;
}

// Extract a numeric reply count from text like "23 Replies" or "Replies: 23".
function extractReplyCount(text: string): string | undefined {
  if (!text) return undefined;
  const m = text.match(/(\d[\d,]*)/);
  if (!m) return undefined;
  return m[1].replace(/,/g, "");
}

const hwz: Scraper = async (topic) => {
  try {
    const url = `${BASE}/search/?q=${encodeTopic(topic)}&o=relevance`;
    const html = await fetchHtml(url);
    if (!html) {
      return { items: [], error: "fetch failed" };
    }

    const $ = cheerio.load(html);
    const items: ScrapedItem[] = [];
    const seen = new Set<string>();

    // XenForo search result variants. Try multiple selectors because the
    // search page may render differently depending on theme/version.
    const candidateSelectors = [
      ".search-results .result",
      ".block-row",
      ".contentRow",
      "li.block-row",
    ];

    let nodes = $("");
    for (const sel of candidateSelectors) {
      const found = $(sel);
      if (found.length > 0) {
        nodes = found;
        break;
      }
    }

    nodes.each((_, el) => {
      if (items.length >= 10) return false;

      const node = $(el);

      // Title anchor — prefer a thread/post title link, fall back to first
      // meaningful anchor in the row.
      const titleAnchor = node
        .find(
          "h3 a, .contentRow-title a, .block-row a.PreviewTooltip, a.PreviewTooltip, h3.title a",
        )
        .first();
      const anchor = titleAnchor.length
        ? titleAnchor
        : node.find("a[href*='/threads/'], a[href*='/posts/']").first();

      const title = (anchor.text() || "").trim();
      const href = anchor.attr("href") || "";
      if (!title || !href) return;

      const absoluteUrl = absolutize(href);
      if (seen.has(absoluteUrl)) return;
      seen.add(absoluteUrl);

      // Reply count appears in various places — meta rows, stat pairs, etc.
      const metaText = node
        .find(
          ".contentRow-minor, .block-row-minor, .meta, .pairs, .contentRow-stats",
        )
        .text();

      let shares: string | undefined;
      const replyMatch = metaText.match(/repl(?:y|ies)\s*[:\-]?\s*(\d[\d,]*)/i);
      if (replyMatch) {
        shares = `${replyMatch[1].replace(/,/g, "")} replies`;
      } else {
        const altMatch = metaText.match(/(\d[\d,]*)\s*repl(?:y|ies)/i);
        if (altMatch) {
          shares = `${altMatch[1].replace(/,/g, "")} replies`;
        }
      }

      const item: ScrapedItem = {
        text: title,
        url: absoluteUrl,
        where: WHERE,
      };
      if (shares) item.shares = shares;

      items.push(item);
    });

    if (items.length === 0) {
      // Some HWZ result pages require a session cookie and render zero hits
      // for unauthenticated fetches — signal that to the dispatcher.
      return { items: [], error: "no results (session may be required)" };
    }

    return { items };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { items: [], error: msg };
  }
};

export default hwz;
