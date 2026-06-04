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

export const ONLINE_AGENTS: Record<string, ChannelAgentConfig> = {
  reddit: {
    startUrl: (t) => `https://www.reddit.com/r/singapore/search/?q=${encodeURIComponent(t)}&restrict_sr=on`,
    goal: (t) => onlineGoal("r/singapore", "the r/singapore search results page", t),
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },
  hwz: {
    startUrl: (t) => `https://forums.hardwarezone.com.sg/search/${encodeURIComponent(t)}/`,
    goal: (t) => onlineGoal("HardwareZone", "HardwareZone forum search results", t),
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },
  mothership: {
    startUrl: (t) => `https://mothership.sg/?s=${encodeURIComponent(t)}`,
    goal: (t) => onlineGoal("Mothership comments", "the Mothership SG search page (look at comment threads on relevant articles)", t),
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },
  telegram: {
    startUrl: () => "https://t.me/s/mothership_sg",
    goal: (t) => onlineGoal("Telegram (public channels)", "a public Telegram channel preview (t.me/s/...)", t),
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },
  tiktok: {
    startUrl: (t) => `https://www.tiktok.com/search?q=${encodeURIComponent(t)}+singapore`,
    goal: (t) => onlineGoal("TikTok", "TikTok search results", t),
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },
  facebook: {
    startUrl: (t) => `https://www.facebook.com/search/posts?q=${encodeURIComponent(t)}+singapore`,
    goal: (t) => onlineGoal("Facebook (public posts)", "Facebook public post search", t),
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },
  ddg: {
    startUrl: (t) => `https://duckduckgo.com/?q=${encodeURIComponent(t)}+singapore+rumour+OR+myth+OR+fake`,
    goal: (t) => onlineGoal("DuckDuckGo", "a DuckDuckGo web-search results page", t),
    outputSchema: ONLINE_OUTPUT_SCHEMA,
  },
};
