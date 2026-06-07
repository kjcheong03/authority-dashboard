/* Channel dispatcher — OpenAI-only.
 *
 * Site-specific scrapers were removed (most failed against live sites due to
 * anti-bot, JS rendering, or selector drift). Every channel now goes through
 * the OpenAI Responses + web_search fallback. The lane minimums + display-name
 * stamping rules still apply.
 *
 * Verified channels: at least 3 items, capped at 10. URL required.
 * Online channels:   at least 5 items, capped at 10. URL preferred.
 */

import type { ScrapeResult, ScrapedItem } from "./types";
import { openAiFallback } from "./fallback";

export interface ChannelMeta {
  id: string;
  displayName: string;
  lane: "verified" | "online";
}

export const CHANNELS: ChannelMeta[] = [
  { id: "moh",        displayName: "MOH",          lane: "verified" },
  { id: "nea",        displayName: "NEA",          lane: "verified" },
  { id: "who",        displayName: "WHO",          lane: "verified" },
  { id: "cdc",        displayName: "CDC",          lane: "verified" },
  { id: "healthhub",  displayName: "HealthHub",    lane: "verified" },
  { id: "reddit",     displayName: "Reddit",       lane: "online" },
  { id: "hwz",        displayName: "HardwareZone", lane: "online" },
  { id: "mothership", displayName: "Mothership",   lane: "online" },
  { id: "telegram",   displayName: "Telegram",     lane: "online" },
  { id: "tiktok",     displayName: "TikTok",       lane: "online" },
  { id: "facebook",   displayName: "Facebook",     lane: "online" },
  { id: "ddg",        displayName: "DuckDuckGo",   lane: "online" },
];

const MAX_ITEMS = 10;
const minForLane = (lane: "verified" | "online") => (lane === "verified" ? 3 : 5);

export interface RunChannelOpts {
  onLog?: (msg: string) => void;
}

export async function runChannel(
  channelId: string,
  topic: string,
  opts?: RunChannelOpts,
): Promise<ScrapeResult> {
  const channel = CHANNELS.find((c) => c.id === channelId);
  if (!channel) return { items: [], error: "unknown channel" };

  opts?.onLog?.(`searching ${channel.displayName} via OpenAI…`);

  const fb = await openAiFallback({
    channelId: channel.id,
    channelLabel: channel.displayName,
    lane: channel.lane,
    topic,
    needed: minForLane(channel.lane),
  });

  let items = (fb.items || []).filter(
    (it) => typeof it.text === "string" && it.text.trim().length > 0,
  );

  // Verified findings require a real URL — drop any item that came back without one.
  if (channel.lane === "verified") {
    items = items.filter((it) => typeof it.url === "string" && it.url.trim().length > 0);
  }

  // Cap and stamp the channel display name on the right field.
  items = items.slice(0, MAX_ITEMS).map((it): ScrapedItem => (
    channel.lane === "verified"
      ? { ...it, agency: channel.displayName }
      : { ...it, where: channel.displayName }
  ));

  return fb.error ? { items, error: fb.error } : { items };
}
