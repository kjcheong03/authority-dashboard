// Reddit scraper — uses the public r/singapore search JSON endpoint.
// Reddit refuses default user agents, but our UA header (set by fetchJson) is
// enough to get a normal JSON response without auth.

import type { Scraper, ScrapedItem } from "./types";
import { fetchJson, encodeTopic } from "./util";

// Minimal shape of the fields we read from Reddit's listing response.
interface RedditChild {
  data?: {
    title?: string;
    permalink?: string;
    ups?: number;
    num_comments?: number;
  };
}

interface RedditListing {
  data?: {
    children?: RedditChild[];
  };
}

const reddit: Scraper = async (topic) => {
  try {
    const url =
      "https://www.reddit.com/r/singapore/search.json?q=" +
      encodeTopic(topic) +
      "&restrict_sr=on&sort=top&t=year&limit=15";

    const json = await fetchJson<RedditListing>(url);
    if (!json || !json.data || !Array.isArray(json.data.children)) {
      return { items: [], error: "reddit: empty or unexpected response" };
    }

    const items: ScrapedItem[] = [];
    for (const child of json.data.children) {
      const d = child?.data;
      if (!d || !d.title || !d.permalink) continue;

      const ups = typeof d.ups === "number" ? d.ups : 0;
      const comments = typeof d.num_comments === "number" ? d.num_comments : 0;

      items.push({
        text: d.title,
        url: "https://reddit.com" + d.permalink,
        where: "Reddit",
        shares: `${ups} upvotes · ${comments} comments`,
      });

      if (items.length >= 12) break;
    }

    if (items.length === 0) {
      return { items: [], error: "reddit: no posts matched topic" };
    }

    return { items };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { items: [], error: `reddit: ${msg}` };
  }
};

export default reddit;
