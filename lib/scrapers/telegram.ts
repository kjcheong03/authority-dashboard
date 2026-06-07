// Telegram channel scraper.
// Uses html.duckduckgo.com (no-JS variant, server-side rendered) to surface
// Singapore-related posts from public Telegram channels via the t.me/s preview
// pages. The no-JS variant is required because regular duckduckgo.com relies on
// client-side JS that won't execute in a plain fetch.

import * as cheerio from "cheerio";
import type { Scraper, ScrapedItem } from "./types";
import { fetchHtml, encodeTopic } from "./util";

// DDG wraps outbound links in /l/?uddg=<encoded-url>. Decode when present so
// the surfaced URL points directly at t.me.
function unwrapDdgHref(href: string): string {
  try {
    if (!href) return href;
    // Protocol-relative or absolute DDG redirect.
    const normalized = href.startsWith("//") ? `https:${href}` : href;
    const u = new URL(normalized, "https://html.duckduckgo.com");
    if (u.pathname === "/l/" || u.pathname.endsWith("/l/")) {
      const uddg = u.searchParams.get("uddg");
      if (uddg) return decodeURIComponent(uddg);
    }
    return normalized;
  } catch {
    return href;
  }
}

// Extract '@handle' from a t.me URL. Supports both t.me/handle/123 and
// t.me/s/handle/123 (the /s/ preview path).
function extractHandle(tmeUrl: string): string | undefined {
  try {
    const u = new URL(tmeUrl);
    if (!u.hostname.endsWith("t.me")) return undefined;
    const parts = u.pathname.split("/").filter(Boolean);
    // Strip the leading 's' segment used by the preview path.
    const head = parts[0] === "s" ? parts[1] : parts[0];
    if (!head) return undefined;
    return `@${head}`;
  } catch {
    return undefined;
  }
}

const telegram: Scraper = async (topic) => {
  try {
    const url = `https://html.duckduckgo.com/html/?q=site:t.me/s+${encodeTopic(topic)}+singapore`;
    const html = await fetchHtml(url);
    if (!html) {
      return { items: [], error: "telegram: fetch failed" };
    }

    const $ = cheerio.load(html);
    const items: ScrapedItem[] = [];

    $(".result").each((_, el) => {
      if (items.length >= 10) return false;
      const $el = $(el);
      const rawHref = $el.find(".result__title a").attr("href") || "";
      const snippet = $el.find(".result__snippet").text().trim();
      if (!rawHref || !snippet) return;

      const realUrl = unwrapDdgHref(rawHref);
      // Only keep t.me results (DDG sometimes leaks non-matching results).
      let host = "";
      try {
        host = new URL(realUrl).hostname;
      } catch {
        return;
      }
      if (!host.endsWith("t.me")) return;

      const handle = extractHandle(realUrl);
      items.push({
        text: snippet,
        url: realUrl,
        where: "Telegram",
        ...(handle ? { shares: handle } : {}),
      });
    });

    return { items };
  } catch (err) {
    return {
      items: [],
      error: `telegram: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
};

export default telegram;
