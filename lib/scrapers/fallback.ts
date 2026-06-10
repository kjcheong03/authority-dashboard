// OpenAI Responses API fallback. The dispatcher calls this whenever a
// channel scraper returns fewer items than the minimum required for its
// lane (verified >= 3, online >= 5). The model is given the web_search
// tool so it can ground its answer in real URLs.
//
// Reference: https://platform.openai.com/docs/guides/tools-web-search
//
// Per the scraper contract, this function NEVER throws — on any failure
// it returns { items: [], error: "..." } so the dispatcher can move on.

import type { ScrapeResult, ScrapedItem } from "./types";

const OPENAI_URL = "https://api.openai.com/v1/responses";
const MODEL = "gpt-4o";
const TIMEOUT_MS = 30000;

export interface FallbackOpts {
  channelId: string;
  channelLabel: string;
  lane: "verified" | "online";
  topic: string;
  needed: number;
}

// Shape of the items we ask the model to return. We deliberately keep
// this narrow — only text + url — and stamp agency/where ourselves based
// on the lane so the fields stay consistent with the scraper contract.
interface ModelItem {
  text?: unknown;
  url?: unknown;
}

interface ModelPayload {
  items?: ModelItem[];
}

// Rich, Singapore-specific descriptions for each channel. The bare display
// name ("MOH") doesn't carry enough context for the model — without this map
// the agent might pull from a non-Singapore Ministry of Health.
const CHANNEL_DESCRIPTORS: Record<string, string> = {
  moh:        "Singapore's Ministry of Health (MOH, moh.gov.sg) — the official Singapore public-health authority. Source URLs must come from moh.gov.sg or other Singapore government domains (gov.sg).",
  nea:        "Singapore's National Environment Agency (NEA, nea.gov.sg) — the official Singapore environmental and vector-control authority. Source URLs must come from nea.gov.sg or other Singapore government domains (gov.sg).",
  who:        "the World Health Organization (WHO, who.int) — the global public-health authority. Source URLs must come from who.int. Prefer Singapore-relevant or globally relevant material.",
  cdc:        "the US Centers for Disease Control and Prevention (CDC, cdc.gov) — a global reference public-health authority. Source URLs must come from cdc.gov. Prefer guidance with global relevance to Singapore.",
  healthhub:  "Singapore's HealthHub (healthhub.sg) — Singapore's official consumer-facing health information service. Source URLs must come from healthhub.sg.",
  reddit:     "Reddit, especially r/singapore (Singapore's largest English-language subreddit). Source URLs must point to actual reddit.com posts or comments.",
  hwz:        "HardwareZone (forums.hardwarezone.com.sg) — Singapore's largest mainstream discussion forum. Source URLs must point to forums.hardwarezone.com.sg threads.",
  mothership: "Mothership.sg — a high-engagement Singapore digital news outlet. Source URLs must come from mothership.sg.",
  telegram:   "Singapore public Telegram channels (e.g. @sgwhispers, @MustShareNewsSG, @SGcommunity) where citizens discuss news and share rumours. Source URLs must come from t.me.",
  facebook:   "Public Facebook posts, pages, and groups relevant to Singapore. Source URLs must come from facebook.com.",
  ddg:        "the open web (Singapore-focused — news outlets, blogs, forums based in or relevant to Singapore). Source URLs can come from any reputable Singapore-focused publisher.",
};

function buildPrompt(opts: FallbackOpts): string {
  const { channelId, channelLabel, lane, topic, needed } = opts;
  const descriptor = CHANNEL_DESCRIPTORS[channelId] ?? channelLabel;

  // Per-lane framing. Verified findings MUST come with a real URL; online
  // claims should but it's not a hard refusal (the dispatcher does not drop
  // URL-less online claims). Both lanes insist on Singapore context.
  const system = lane === "verified"
    ? [
        `You are an investigator searching the web for the most recent official statements, news, advisories, or guidance from ${descriptor}`,
        `Topic: "${topic}". Audience: a Singapore public-health officer who needs to draft a citizen broadcast right now.`,
        `Return AT LEAST ${needed} real items. EVERY item MUST be backed by a real URL you can cite — never invent URLs. The URL field is REQUIRED; items without a URL will be dropped.`,
        `Findings must be specifically about Singapore unless this is a global authority (WHO or CDC), in which case prefer guidance that's globally relevant to Singapore.`,
      ].join("\n\n")
    : [
        `You are an investigator searching the web for misinformation, rumours, false claims, hoaxes, or panicked posts circulating on ${descriptor} about "${topic}" in the Singapore context.`,
        `Audience: a Singapore public-health officer who needs to know what citizens are saying so the broadcast can directly refute it.`,
        `Return AT LEAST ${needed} real claims. Include a real source URL whenever possible — never invent URLs. Items without a URL are still useful but URLed items are strongly preferred.`,
      ].join("\n\n");

  const instruction =
    'Return ONLY a JSON object of the form { "items": [ { "text": "claim or finding text", "url": "https://..." } ] }. No prose outside the JSON. No markdown fences.';

  return `${system}\n\n${instruction}`;
}

// The Responses API surfaces the assistant's textual output in a few
// shapes depending on tool use. We walk the `output` array, pick out any
// text content, and concatenate it before attempting to locate the JSON
// payload. Defensive: nothing here may throw.
function extractOutputText(resp: unknown): string {
  if (!resp || typeof resp !== "object") return "";
  const r = resp as Record<string, unknown>;

  // Convenience field some SDK examples document.
  if (typeof r.output_text === "string" && r.output_text.length > 0) {
    return r.output_text;
  }

  const output = r.output;
  if (!Array.isArray(output)) return "";

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    // Assistant message items carry a `content` array of typed parts.
    const content = it.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      // `output_text` is the canonical text part type from /v1/responses.
      if (typeof p.text === "string" && p.text.length > 0) {
        chunks.push(p.text);
      }
    }
  }
  return chunks.join("\n");
}

// Pull the first JSON object out of the model's text. The model sometimes
// wraps the JSON in a ```json fenced block or trailing commentary, so we
// locate the outermost braces rather than JSON.parse'ing the whole string.
function parseItems(text: string): ModelItem[] {
  if (!text) return [];

  const tryParse = (raw: string): ModelItem[] | null => {
    try {
      const obj = JSON.parse(raw) as ModelPayload;
      if (obj && Array.isArray(obj.items)) return obj.items;
      return null;
    } catch {
      return null;
    }
  };

  // First attempt: whole string is JSON.
  const direct = tryParse(text);
  if (direct) return direct;

  // Second attempt: slice from the first "{" to the last "}".
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const sliced = text.slice(start, end + 1);
    const parsed = tryParse(sliced);
    if (parsed) return parsed;
  }

  return [];
}

export async function openAiFallback(opts: FallbackOpts): Promise<ScrapeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { items: [], error: "fallback: OPENAI_API_KEY not set" };
  }

  const prompt = buildPrompt(opts);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        tools: [{ type: "web_search" }],
        input: prompt,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        items: [],
        error: `fallback: openai ${res.status} ${detail.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as unknown;
    const text = extractOutputText(json);
    const raw = parseItems(text);

    const items: ScrapedItem[] = [];
    for (const r of raw) {
      const txt = typeof r.text === "string" ? r.text.trim() : "";
      if (!txt) continue;
      const url = typeof r.url === "string" ? r.url.trim() : "";

      const item: ScrapedItem = { text: txt };
      if (url) item.url = url;
      if (opts.lane === "verified") {
        item.agency = opts.channelLabel;
      } else {
        item.where = opts.channelLabel;
      }
      items.push(item);
    }

    return { items };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { items: [], error: `fallback: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}
