// Mothership SG scraper.
// Tries the tag page first (https://mothership.sg/tag/<slug>/), then falls back
// to the site search (https://mothership.sg/?s=<encoded>) when the tag page
// yields nothing. Returns up to 10 items pinned with `where: 'Mothership'`.

import * as cheerio from "cheerio";
import type { ScrapedItem, ScrapeResult, Scraper } from "./types";
import { fetchHtml, slugify, encodeTopic } from "./util";

const DISPLAY = "Mothership";
const MAX_ITEMS = 10;

// Parse a Mothership listing page (tag or search) into ScrapedItems.
// Mothership wraps each story in an <article>, with the headline inside an
// h2/h3 and an <a> as the canonical link. We also try generic .post-card /
// .post containers in case the markup differs by surface.
function parseListing(html: string): ScrapedItem[] {
  const $ = cheerio.load(html);
  const items: ScrapedItem[] = [];
  const seen = new Set<string>();

  const cards = $("article, .post-card, .post");

  cards.each((_, el) => {
    if (items.length >= MAX_ITEMS) return false;
    const $el = $(el);

    // Headline: prefer the first h2/h3 inside the card, fall back to any
    // anchor with a non-empty title-ish text.
    const headline =
      $el.find("h2 a, h3 a, h2, h3").first().text().trim() ||
      $el.find("a").first().text().trim();
    if (!headline) return;

    // URL: first anchor with an href is usually the article permalink.
    let url = $el.find("h2 a, h3 a").first().attr("href") || "";
    if (!url) url = $el.find("a").first().attr("href") || "";
    if (url && url.startsWith("/")) url = `https://mothership.sg${url}`;

    if (seen.has(headline)) return;
    seen.add(headline);

    // Snippet/preview: Mothership uses .entry-summary on some templates and
    // <p> for the dek on others.
    const snippet =
      $el.find(".entry-summary, .post-excerpt, .excerpt, p").first().text().trim() || "";

    // Date: <time> when present, otherwise common date class names.
    const date =
      $el.find("time").first().attr("datetime") ||
      $el.find("time, .entry-date, .post-date, .date").first().text().trim() ||
      "";

    const item: ScrapedItem = {
      text: snippet ? `${headline} — ${snippet}` : headline,
      where: DISPLAY,
    };
    if (url) item.url = url;
    if (date) item.timeAgo = date;

    items.push(item);
  });

  return items;
}

const mothership: Scraper = async (topic: string): Promise<ScrapeResult> => {
  try {
    const slug = slugify(topic);
    const primaryUrl = `https://mothership.sg/tag/${slug}/`;
    const fallbackUrl = `https://mothership.sg/?s=${encodeTopic(topic)}`;

    let html = await fetchHtml(primaryUrl);
    let items: ScrapedItem[] = html ? parseListing(html) : [];

    if (items.length === 0) {
      html = await fetchHtml(fallbackUrl);
      items = html ? parseListing(html) : [];
    }

    return { items: items.slice(0, MAX_ITEMS) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { items: [], error: `mothership: ${msg}` };
  }
};

export default mothership;
