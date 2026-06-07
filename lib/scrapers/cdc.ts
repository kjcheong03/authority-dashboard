// CDC verified-channel scraper.
// Hits the public CDC search endpoint and parses the server-rendered results.
// URL shape: https://search.cdc.gov/search/?query=<topic>
// We try a couple of selector fallbacks because CDC has shipped subtly
// different markup for the same page over time.

import * as cheerio from "cheerio";
import type { Scraper, ScrapedItem } from "./types";
import { fetchHtml, encodeTopic } from "./util";

const cdc: Scraper = async (topic) => {
  try {
    const url = `https://search.cdc.gov/search/?query=${encodeTopic(topic)}`;
    const html = await fetchHtml(url);
    if (!html) {
      return { items: [], error: "cdc: fetch failed" };
    }

    const $ = cheerio.load(html);
    const items: ScrapedItem[] = [];

    // Primary selector — current CDC search markup.
    // Fallbacks cover older variants that have shown up in the wild.
    const cards = $(
      ".searchResultsList .item, .cdcResult, .results-content .result, li.searchResultsItem",
    );

    cards.each((_, el) => {
      if (items.length >= 8) return false;

      const card = $(el);

      // Title + link usually live in an <h3><a> pair, but some variants use h2.
      const anchor = card.find("h3 a, h2 a, a.searchResultTitle").first();
      const title = anchor.text().trim();
      const href = anchor.attr("href")?.trim();

      // Snippet candidates — pick the first non-empty match.
      const snippet =
        card.find(".searchResultDescription").first().text().trim() ||
        card.find(".description").first().text().trim() ||
        card.find("p").first().text().trim();

      if (!title) return;

      const text = snippet ? `${title} — ${snippet}` : title;

      items.push({
        text,
        url: href,
        agency: "CDC",
      });
    });

    return { items };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { items: [], error: `cdc: ${msg}` };
  }
};

export default cdc;
