/* ───────────────────────────────────────────────────────────────────────────
 * Per-channel TinyFish agent configurations.
 *
 * Each channel in the surveillance grid runs its own TinyFish session with a
 * focused start URL + goal. Phase 1 fires all VERIFIED agents in parallel
 * (Promise.allSettled), Phase 2 fires all ONLINE agents in parallel. Each
 * session emits its own streaming URL → tagged to the tile it belongs to.
 *
 * Budget: ≤60s per session (TinyFish queues anything over the account cap).
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ChannelAgentConfig {
  /** Start URL the agent navigates to first. */
  startUrl: (topic: string) => string;
  /** Natural-language instruction for the agent. */
  goal: (topic: string) => string;
  /** Output schema TinyFish should conform its result to. */
  outputSchema: Record<string, unknown>;
}

// ── Output schemas (one per lane) ─────────────────────────────────────────

export const VERIFIED_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    advisory_summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          agency: { type: "string" },
          stat: { type: "string" },
          text: { type: "string" },
          url: { type: "string" },
        },
        required: ["agency", "text"],
      },
    },
  },
  required: ["findings"],
} as const;

export const ONLINE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          where: { type: "string" },
          shares: { type: "string" },
        },
        required: ["text"],
      },
    },
  },
  required: ["claims"],
} as const;

// ── Shared goal templates ─────────────────────────────────────────────────

function verifiedGoal(agencyTag: string, domain: string, scope: string, topic: string): string {
  return `You are CARA, an official public-health research agent for Singapore.

Validate the topic "${topic}" by extracting current guidance from ${agencyTag} (${domain}).
${scope}

Process:
1. Start at the given site.
2. Use site search or navigation to find pages relevant to "${topic}".
3. Read the actual pages — do not invent. Each finding must come from a real ${domain} URL.

Budget: spend at most 60 seconds. Return whatever you have even if partial — quality over coverage.

Tag EVERY finding with agency: "${agencyTag}".

Return ONLY JSON:
{
  "advisory_summary": "1-2 sentence summary of ${agencyTag}'s current stance",
  "findings": [
    { "agency": "${agencyTag}", "stat": "short figure if any", "text": "the finding in plain language", "url": "the ${domain} page" }
  ]
}`;
}

function onlineGoal(channelTag: string, surface: string, topic: string): string {
  return `You are CARA scanning ${channelTag} for misinformation, rumours, or confusion about "${topic}" in the Singapore context.

Process:
1. You are on ${surface}. Read whatever posts/comments/results are visible there.
2. Capture each DISTINCT claim — false treatments, fake cures, lockdown rumours, distortions of official guidance.
3. Verbatim-ish text; tag where it appears (subreddit, post URL, channel).

Budget: spend at most 60 seconds. Return whatever you have, even one or two claims is fine.

Tag EVERY claim with where: "${channelTag}".

Return ONLY JSON:
{
  "claims": [
    { "text": "the claim close to verbatim", "where": "${channelTag}", "shares": "engagement signal if visible" }
  ]
}`;
}

// ── Verified-lane channels ────────────────────────────────────────────────

export const VERIFIED_AGENTS: Record<string, ChannelAgentConfig> = {
  moh: {
    startUrl: () => "https://www.moh.gov.sg",
    goal: (t) => verifiedGoal(
      "MOH",
      "moh.gov.sg",
      "Look for MOH press releases, advisories, weekly bulletins, and policy statements. Capture Singapore-specific case counts, vaccination eligibility, treatment guidance.",
      t,
    ),
    outputSchema: VERIFIED_OUTPUT_SCHEMA,
  },
  nea: {
    startUrl: () => "https://www.nea.gov.sg",
    goal: (t) => verifiedGoal(
      "NEA",
      "nea.gov.sg",
      "Look for NEA pages on vector control, clusters, environmental health alerts, and inspection campaigns. Capture cluster counts, locations, and operational responses.",
      t,
    ),
    outputSchema: VERIFIED_OUTPUT_SCHEMA,
  },
  who: {
    startUrl: (t) => `https://www.who.int/news-room/fact-sheets`,
    goal: (t) => verifiedGoal(
      "WHO",
      "who.int",
      "Look for WHO fact sheets, outbreak situation reports, and global guidance. Mark findings as global context, not Singapore-specific.",
      t,
    ),
    outputSchema: VERIFIED_OUTPUT_SCHEMA,
  },
  cdc: {
    startUrl: () => "https://www.cdc.gov",
    goal: (t) => verifiedGoal(
      "CDC",
      "cdc.gov",
      "Look for CDC topic pages, treatment guidance, travel advisories, and disease characterisation. Mark findings as global/US context.",
      t,
    ),
    outputSchema: VERIFIED_OUTPUT_SCHEMA,
  },
  healthhub: {
    startUrl: () => "https://www.healthhub.sg",
    goal: (t) => verifiedGoal(
      "HealthHub",
      "healthhub.sg",
      "Look for HealthHub / Health Promotion Board consumer-facing health articles. Capture prevention tips, eligibility for screening or vaccination, and self-care guidance for older adults.",
      t,
    ),
    outputSchema: VERIFIED_OUTPUT_SCHEMA,
  },
};

// ── Online-lane channels ──────────────────────────────────────────────────
//
// Strategy across all 7: target HIGH-ENGAGEMENT content (top views / likes /
// followers / replies) so what the agent captures is what's actually
// circulating with citizens — not low-signal noise. Avoid login walls by
// routing through public previews or DuckDuckGo's site: operator.

export const ONLINE_AGENTS: Record<string, ChannelAgentConfig> = {
  /* Reddit — top-voted posts in r/singapore for the topic, last year.
     old.reddit.com renders fully server-side so it's reliable to scrape and
     `sort=top&t=year` surfaces the highest-engagement threads.            */
  reddit: {
    startUrl: (t) =>
      `https://old.reddit.com/r/singapore/search?q=${encodeURIComponent(t)}&restrict_sr=on&sort=top&t=year&include_over_18=on`,
    goal: (t) => `You are CARA scanning r/singapore — Singapore's largest public Reddit community — for misinformation about "${t}".

You are on the r/singapore SEARCH RESULTS PAGE, sorted by TOP votes over the last year. The highest-engagement (most upvoted, most commented) posts are at the top.

Process:
1. Read the top 5–8 posts visible. For each: capture the post TITLE verbatim, and skim any visible self-text or top comments shown on the listing.
2. Treat as a CLAIM anything that asserts a fact, cure, rumour, distortion of official guidance, or "I heard that…" speculation related to "${t}". Skip pure questions ("can someone explain…").
3. Click into the single highest-upvoted thread if titles aren't enough to capture claims. Read its top 1–2 comments.
4. Note the upvote count for each captured claim — that's the engagement signal.

Budget: spend at most 60 seconds. Even 1–2 high-engagement claims is more valuable than 10 low-signal ones.

Tag EVERY claim with where: "Reddit".

Return ONLY JSON:
{
  "claims": [
    { "text": "the claim close to verbatim from the post title or top comment", "where": "Reddit", "shares": "upvote count e.g. '847 upvotes' or 'XYZ comments'" }
  ]
}`,
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },

  /* HardwareZone — Singapore's biggest mainstream forum (Eat-Drink-Man-Woman
     section is famous for citizen rumours). Search results, sort by replies
     so the most-discussed threads bubble up.                              */
  hwz: {
    startUrl: (t) =>
      `https://forums.hardwarezone.com.sg/search/?q=${encodeURIComponent(t)}&o=replies`,
    goal: (t) => `You are CARA scanning HardwareZone (forums.hardwarezone.com.sg) — Singapore's largest mainstream discussion forum — for misinformation about "${t}".

You are on the HWZ search results page, ordered by REPLY COUNT so the most-discussed threads are first. The "Eat-Drink-Man-Woman" and "Current Affairs" sections in particular are known for citizen rumours.

Process:
1. Look at the top 5 search result threads — these have the highest reply counts.
2. Read the visible thread TITLES and any snippet shown. Capture any claim about "${t}" — fake cures, rumours, distortions, panic.
3. If titles are vague, click into the top thread and read the opening post + first highly-upvoted reply.
4. Note reply counts and views as the engagement signal.

Budget: spend at most 60 seconds.

Tag EVERY claim with where: "HardwareZone".

Return ONLY JSON:
{
  "claims": [
    { "text": "the claim close to verbatim", "where": "HardwareZone", "shares": "reply count or view count e.g. '128 replies · 4.2K views'" }
  ]
}`,
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },

  /* Mothership — tag page (e.g. /tag/covid-19/). This is the curated landing
     page for each topic on Singapore's most-shared news site; lists articles
     by recency, no search box needed. Falls through to nothing-found message
     if the tag doesn't exist for the given topic.                          */
  mothership: {
    startUrl: (t) =>
      `https://mothership.sg/tag/${t.toLowerCase().trim().replace(/[\s]+/g, "-")}/`,
    goal: (t) => `You are on Mothership SG's tag page for "${t}" (mothership.sg/tag/${t.toLowerCase().replace(/\s+/g, "-")}/). Mothership is one of Singapore's most-shared news outlets — this page lists every article they've published on the topic, newest first.

DO NOT click into any article or navigate away. Stay on this tag page.

Read the 5–8 article cards visible (scroll if needed). Each card shows the article HEADLINE and a short preview snippet.

For EACH article card, capture:
- "text": the headline verbatim, and append the preview snippet if it adds claim content (separate with " — ")
- "shares": article date if visible (e.g. "23 Nov 2024"), otherwise leave blank

Capture EVERY relevant card — don't pre-filter for misinformation. The downstream classifier decides which are problematic.

If the page is empty or shows "tag not found", return 2 entries that describe this gracefully (e.g. text: "No Mothership coverage found for '${t}'").

Budget: 45 seconds max. Return JSON immediately when you have 4+ entries.

Return ONLY JSON:
{
  "claims": [
    { "text": "headline — preview snippet", "where": "Mothership", "shares": "article date" }
  ]
}`,
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },

  /* Telegram — crawl public Singapore Telegram channels/groups via Google's
     index (DuckDuckGo's site: operator). One DDG page lists messages from
     multiple SG channels mentioning the topic — that's the "crawl across
     groups" pattern.                                                       */
  telegram: {
    startUrl: (t) =>
      `https://duckduckgo.com/?q=site%3At.me+${encodeURIComponent(t)}+singapore`,
    goal: (t) => `You are on a DuckDuckGo search results page that lists posts from PUBLIC Singapore Telegram channels and groups mentioning "${t}". The query is "site:t.me ${t} singapore" — each result links to a public Telegram channel post (t.me/<channel>/<id>).

DO NOT click into any result. Stay on this DDG search page.

Read the top 6–10 search result cards. Each card shows: the Telegram channel/group title, the t.me URL (revealing the channel handle), and a snippet of the actual message body.

For EACH result whose URL is a Singapore community Telegram channel/group (handles often contain "sg", "singapore", or are known SG names like sgwhispers, SGcommunity, SGAG, sgcoffeeshop, MustShareNewsSG, straits_times) and mentions "${t}", capture:
- "text": the message snippet verbatim
- "shares": channel handle from the URL (e.g. "@sgwhispers", "@SGcommunity")

Capture EVERY relevant result — don't pre-filter for misinformation. The downstream classifier decides.

If you find nothing topic-relevant, return at least 3 entries from the most prominent SG-channel results visible.

Budget: 45 seconds max. Return JSON immediately when you have 4+ entries.

Return ONLY JSON:
{
  "claims": [
    { "text": "the message snippet verbatim from a SG Telegram channel", "where": "Telegram", "shares": "channel handle e.g. '@sgwhispers'" }
  ]
}`,
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },

  /* TikTok — start at the homepage and use the in-page search (the specified
     flow): search box → type the topic → read the resulting video cards.
     Never touch the result tabs (Top/Users/Videos/LIVE/Photo).             */
  tiktok: {
    startUrl: () => `https://www.tiktok.com/`,
    goal: (t) => `You are on the TikTok HOME page (https://www.tiktok.com/). Your job: search for "${t}", open the "Top" results tab, and read the VIDEO CARDS.

STEP-BY-STEP — follow exactly:
1. Click the SEARCH button/icon (the magnifying glass) or the search input box at the top of the page.
2. Type "${t}" into the search box and submit it (press Enter, or click the search/submit button).
3. On the results page, click the "Top" tab to select it. Do NOT click any other tab — not "Users", "Videos", "LIVE", "Photo", or "Reposts". ONLY "Top".
4. Read the grid of VIDEO CARDS shown under the "Top" tab.
- If a "Log in" modal pops up, close it with its X button only — never click any login option.
- Do NOT click into any individual video or open a profile.

Each video card shows: a thumbnail, a TITLE/CAPTION (often with hashtags), a like count (e.g. "158.7K"), and an uploader handle.

Read the top 8–12 video cards. For EACH card capture:
- "text": the video title/caption verbatim (keep hashtags, emojis)
- "shares": the like count + uploader handle (e.g. "158.7K likes · vano_6787")

Capture EVERY card you can see — do not pre-filter. Tag where: "TikTok".

Budget: 60 seconds max. Return JSON as soon as you have 5+ entries.

Return ONLY JSON:
{
  "claims": [
    { "text": "the video title/caption verbatim", "where": "TikTok", "shares": "likes · uploader" }
  ]
}`,
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },

  /* Facebook — single-page DDG search with facebook in the query (no site:
     operator since DDG sometimes blocks that). Just read the results page. */
  facebook: {
    startUrl: (t) =>
      `https://duckduckgo.com/?q=${encodeURIComponent(t)}+singapore+facebook+post`,
    goal: (t) => `You are on a DuckDuckGo search results page for "${t} singapore facebook post". The results are public Facebook posts, pages, and groups Google has indexed.

DO NOT click into any result. Stay on this DDG search page.

Read the 5–10 search result cards visible. Each card shows a title (often a Facebook page or post title) and a snippet of text.

For EACH result mentioning "${t}", capture:
- "text": the snippet verbatim (the cached preview text)
- "shares": page name + follower count if visible (e.g. "Mothership · 2.3M followers")

Capture EVERY relevant card — don't pre-filter for misinformation. The downstream classifier decides.

If you find nothing about "${t}", return at least 3 entries from the most-prominent visible Facebook-related results.

Budget: 45 seconds max. Return JSON immediately when you have 3+ entries.

Return ONLY JSON:
{
  "claims": [
    { "text": "the snippet verbatim", "where": "Facebook", "shares": "page name + follower count if visible" }
  ]
}`,
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },

  /* DuckDuckGo — open web search with explicit misinformation operators.
     Catches misinfo outside the named platforms above (blogs, smaller forums,
     mainland-media reposts).                                              */
  ddg: {
    startUrl: (t) =>
      `https://duckduckgo.com/?q=${encodeURIComponent(t)}+singapore+(rumour+OR+myth+OR+fake+OR+hoax+OR+%22fact+check%22)`,
    goal: (t) => `You are CARA on a DuckDuckGo open-web search for misinformation about "${t}" in Singapore. The query includes "rumour OR myth OR fake OR hoax" so the results bias toward claims being debunked or circulating.

Process:
1. Scan the top 8–10 web results. The most-linked / highest-domain-authority results sit at the top.
2. Capture each DISTINCT claim mentioned in the result snippets — fake cures, conspiracy framings, lockdown rumours, viral hoaxes.
3. The result snippet is usually enough — no need to click through unless a result clearly contains a claim but no snippet text.
4. Use the result URL as the source if useful.

Budget: spend at most 60 seconds.

Tag EVERY claim with where: "DuckDuckGo".

Return ONLY JSON:
{
  "claims": [
    { "text": "the claim verbatim from a result snippet", "where": "DuckDuckGo", "shares": "result rank if relevant e.g. '#1 result' or domain reputation" }
  ]
}`,
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },
};
