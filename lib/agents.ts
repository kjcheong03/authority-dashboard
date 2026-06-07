/* ───────────────────────────────────────────────────────────────────────────
 * Agent definitions: TinyFish goals + output_schemas, and OpenAI reasoning.
 * ─────────────────────────────────────────────────────────────────────────── */

import type { Claim, Finding, Draft, TopicInput } from "./types";

const OPENAI_KEY = process.env.OPENAI_API_KEY!;

// Fast, current models. Swap here if the account has access to newer ids.
const MODEL_CLASSIFY = "gpt-4.1-mini";
const MODEL_DRAFT = "gpt-4.1-mini";

/* ─── TinyFish: Phase 1 — Ingest official guidance ────────────────────────── */
// Topic-driven. Starts from a search engine and prioritises official health
// authorities, so any public-health topic works (dengue, H5N1, hantavirus, …).

export const INGEST_START_URL = "https://duckduckgo.com";

export function ingestGoal(t: TopicInput): string {
  const ctx = t.region ? ` Region / context within Singapore: ${t.region}.` : "";
  return `You are ORCA, an official public-health research agent for SINGAPORE authorities.
Topic under validation: "${t.topic}".${ctx}

Gather the CURRENT authoritative guidance on this topic, tailored to the Singapore context.

SOURCE PRIORITY (this matters):
1. PRIMARY — official Singapore government & health sources. Search these first and
   rely on them most: Ministry of Health (moh.gov.sg), NEA (nea.gov.sg), HealthHub /
   Health Promotion Board (healthhub.sg / hpb.gov.sg), HSA (hsa.gov.sg), gov.sg, and
   Singapore public hospitals. Capture Singapore-specific figures (local case counts,
   clusters, advisories, schemes).
2. ALWAYS search data.gov.sg — visit https://data.gov.sg/datasets?query=<topic> and find
   any open datasets relevant to "${t.topic}". If found, include at least one finding
   tagged with agency "data.gov.sg" (or the publishing agency) AND a url that contains
   "data.gov.sg". Capture the most recent statistic the dataset surfaces.
3. SECONDARY — use WHO and (sparingly) US CDC / ECDC ONLY for global context the local
   sources don't cover (e.g. background on a novel pathogen). Clearly mark these as global.

Aim for mostly Singapore findings with at most one or two global-context findings.
Navigate to the ACTUAL pages, not just search results. Every finding MUST include a
real source URL (prefer .gov.sg / official domains).

Spend no more than 3 minutes. Return what you have even if partial.

Return ONLY a JSON object of this exact shape (no prose, no markdown):
{
  "advisory_summary": "1-2 sentence summary of current Singapore guidance",
  "findings": [ { "agency": "MOH|NEA|HealthHub|HSA|WHO|CDC", "stat": "short figure e.g. '619 cases'", "text": "the verified finding", "url": "source url" } ],
  "target_groups": ["..."],
  "locations": ["Singapore locations e.g. Tampines"],
  "sources": [ { "name": "MOH", "url": "https://www.moh.gov.sg/..." } ]
}`;
}

// NOTE: TinyFish output_schema rejects per-property "description" fields, so we
// keep the schema plain and put guidance in the goal text instead.
export const INGEST_SCHEMA = {
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
    target_groups: { type: "array", items: { type: "string" } },
    locations: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, url: { type: "string" } },
        required: ["name", "url"],
      },
    },
  },
  required: ["advisory_summary", "findings", "sources"],
} as const;

export interface IngestResult {
  advisory_summary?: string;
  findings?: Finding[];
  target_groups?: string[];
  locations?: string[];
  sources?: { name: string; url: string }[];
}

/* ─── TinyFish: Phase 2 — Scan public claims ──────────────────────────────── */
// Topic-driven web search for misinformation/confusion. (The seeded /feed page
// remains available for the recorded dengue replay narrative.)

export const MISINFO_START_URL = "https://duckduckgo.com";

export function misinfoGoal(t: TopicInput): string {
  return `You are ORCA scanning public channels for misinformation and confusion about: "${t.topic}",
in the SINGAPORE context.

Search for claims, myths, rumours, or misconceptions Singapore residents are spreading
— especially fake cures, false prevention advice, or distortions of official guidance.
Prioritise Singapore-relevant channels and discussion (e.g. local forums such as
HardwareZone, Reddit r/singapore, local Facebook/WhatsApp/Telegram chatter, Mothership/
TODAY comment threads). Capture each distinct claim, where it is circulating, and any
spread indicator.

Spend no more than 3 minutes. Return what you have even if partial.

Return ONLY a JSON object of this exact shape (no prose, no markdown):
{ "claims": [ { "text": "the claim close to verbatim", "where": "channel e.g. r/singapore, WhatsApp", "shares": "spread indicator if any" } ] }`;
}

export const MISINFO_SCHEMA = {
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

export interface RawClaim {
  text: string;
  where?: string;
  shares?: string;
}

/* ─── OpenAI: classify scraped claims against verified findings ────────────── */

export async function classifyClaims(
  rawClaims: RawClaim[],
  findings: Finding[],
  advisorySummary: string,
): Promise<Omit<Claim, "id">[]> {
  if (!rawClaims.length) return [];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: MODEL_CLASSIFY,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are ORCA's misinformation-intelligence engine for a public-health authority.
You are given (a) the VERIFIED official guidance and (b) a list of claims circulating in public channels.

For each claim decide whether it is misinformation/confusion relative to the official guidance.
Severity:
- "UNVERIFIED": a claim that contradicts or invents guidance and could cause harm (e.g. fake cures).
- "MINOR_DISCREPANCY": outdated, exaggerated, or partially-true info that causes confusion but is lower risk.
Drop claims that are actually consistent with official guidance.

Write tersely. No filler, no hedging, no restating the claim inside other fields.
For each retained claim return:
- text: the claim, trimmed to one sentence
- severity
- where: the channel name ONLY, max 3 words (e.g. "HardwareZone", "WhatsApp", "X", "Reddit"). No thread titles, no descriptions, no parentheticals.
- shares: a short spread indicator if given (e.g. "3.2k shares", "2 pages"), else omit. Never a sentence.
- contradicts: which official guidance it distorts — one clause, no preamble
- analysis: why it is wrong/risky — one short clause
- fix: the clarification for a broadcast — one short sentence

Return ONLY JSON: { "claims": [ { "text","severity","where","shares","contradicts","analysis","fix" } ] }`,
        },
        {
          role: "user",
          content: `OFFICIAL GUIDANCE SUMMARY:\n${advisorySummary}\n\nVERIFIED FINDINGS:\n${JSON.stringify(findings, null, 2)}\n\nCLAIMS FROM PUBLIC CHANNELS:\n${JSON.stringify(rawClaims, null, 2)}`,
        },
      ],
    }),
  });

  const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
  if (!res.ok) console.error("[classifyClaims] OpenAI error", res.status, JSON.stringify(data).slice(0, 240));
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content) as { claims?: Omit<Claim, "id">[] };
    return parsed.claims ?? [];
  } catch {
    return [];
  }
}

/* ─── OpenAI fallback: recall prominent KNOWN misinformation ──────────────────
 * When the live scrape surfaces no validated misinformation, recall the 2–4 most
 * prominent real misinformation claims that have circulated about the topic on the
 * monitored platforms. Same shape as classifyClaims so it stores + renders the
 * same way. Degrades to [] on any error. */
export async function generateFallbackClaims(
  t: TopicInput,
  advisorySummary: string,
  findings: Finding[],
  platforms: string[],
): Promise<Omit<Claim, "id">[]> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL_CLASSIFY,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are ORCA's misinformation-intelligence engine for Singapore public health.
A live scrape of public channels surfaced NO clearly-flagged misinformation for the topic below.
Using your knowledge of REAL misinformation that has actually circulated about this topic — especially
in the Singapore / Southeast Asian context — list the 2 to 4 MOST PROMINENT misinformation claims,
judged against the official guidance.

Rules:
- Real, commonly-seen misinformation patterns only. Do NOT invent far-fetched claims.
- Each must contradict or distort the official guidance in a way that could cause harm or confusion.
- "where" MUST be one platform chosen from this list (pick the most plausible per claim): ${platforms.join(", ")}.
- Severity: "UNVERIFIED" for harmful/contradicting claims (e.g. fake cures); "MINOR_DISCREPANCY" for lower-risk confusion.
- Write tersely. No filler, no hedging.

For each claim return:
- text: the claim as people state it, one sentence
- severity
- where: the platform name only, max 3 words
- shares: a short plausible spread indicator (e.g. "circulating widely") or omit
- contradicts: which official guidance it distorts — one clause
- analysis: why it is wrong/risky — one short clause
- fix: the clarification for a broadcast — one short sentence

Return ONLY JSON: { "claims": [ { "text","severity","where","shares","contradicts","analysis","fix" } ] }`,
          },
          {
            role: "user",
            content: `TOPIC: ${t.topic}${t.region ? ` (${t.region})` : ""}\n\nOFFICIAL GUIDANCE SUMMARY:\n${advisorySummary}\n\nVERIFIED FINDINGS:\n${JSON.stringify(findings, null, 2)}`,
          },
        ],
      }),
    });
    const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
    if (!res.ok) console.error("[generateFallbackClaims] OpenAI error", res.status, JSON.stringify(data).slice(0, 240));
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { claims?: Omit<Claim, "id">[] };
    const out = (parsed.claims ?? []).slice(0, 4);
    if (!out.length) console.error("[generateFallbackClaims] returned 0 — status", res.status, "content:", content.slice(0, 200));
    return out;
  } catch {
    return [];
  }
}

/* ─── OpenAI: trace the origin & spread of misinformation (web search) ─────── */
// Uses the Responses API with the web_search tool to find where a claim started
// and how it propagated. Degrades gracefully (returns []) on any failure.

export interface OriginResult {
  id: string;
  singleSource?: boolean;
  timeline?: { date?: string; outlet: string; event: string; type: string; url?: string }[];
}

export async function traceOrigins(
  claims: { id: string; text: string }[],
  t: TopicInput,
): Promise<OriginResult[]> {
  if (!claims.length) return [];
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL_CLASSIFY,
        tools: [{ type: "web_search" }],
        input: `You are ORCA tracing the ORIGIN and spread of health misinformation about "${t.topic}" in the Singapore context.

For EACH claim below, use web search to trace how it spread, then return a concise propagation timeline.

Writing rules — be minimal and easy to read:
- Use short, common outlet names: "X" (never "X (formerly Twitter)"), "WHO", "NYT", "Reddit", "TikTok". No parentheticals, no full legal names.
- event: one short clause — what that outlet did. Do NOT restate the claim.
- url: a direct link to that specific source/article (required for each step — this is how officers verify it).

MANDATORY DEBUNK — every claim's timeline MUST include at least one step with type "debunk" that links to a REAL, authoritative, verifiable source whose published facts disprove the claim. Prefer health authorities (WHO, CDC, MOH, NEA, ECDC) or established fact-checkers (AFP, Reuters, Snopes, Mothership).
- The specific viral post may be obscure or fabricated, but the CORRECTIVE FACT and its authoritative source are real — find and cite them. (e.g. for "ivermectin cures Hantavirus", link the CDC/WHO Hantavirus page stating there is no specific cure.)
- The debunk url MUST be a real, reachable page — never invent or guess a URL. If you cannot verify a specific authoritative page, link the relevant health authority's official topic page.
- Place the debunk as the last step in the timeline.

CLAIMS:
${claims.map((c) => `[${c.id}] "${c.text}"`).join("\n")}

Return ONLY JSON (no prose, no markdown):
{ "origins": [ {
  "id": "<the claim id exactly as given>",
  "singleSource": true or false,
  "timeline": [ { "date": "YYYY-MM-DD", "outlet": "short name", "event": "short clause", "type": "origin|amplification|debunk|investigation", "url": "https://..." } ]
} ] }`,
      }),
    });
    const data = (await res.json()) as { output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> };
    let text = "";
    for (const item of data.output ?? []) {
      if (item.type === "message" && item.content) {
        for (const c of item.content) if (c.type === "output_text" && c.text) text += c.text;
      }
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return [];
    return (JSON.parse(m[0]) as { origins?: OriginResult[] }).origins ?? [];
  } catch {
    return [];
  }
}

/* ─── OpenAI: broadcast triage decision ───────────────────────────────────── */
// Weighs local relevance + Singapore coverage + misinformation into a verdict.

import type { Assessment, Spread } from "./types";

export async function generateAssessment(
  t: TopicInput,
  advisorySummary: string,
  findings: Finding[],
  spread: Spread | null,
  claims: Omit<Claim, "id">[],
): Promise<Assessment> {
  const highRisk = claims.filter((c) => c.severity === "UNVERIFIED").length;
  const fallback: Assessment = {
    verdict: claims.length ? "MONITOR" : "NO ACTION",
    rationale: "Insufficient signal to recommend a broadcast.",
    urgency: "NORMAL",
    audience: t.audience || "Caregivers",
    signals: { local: "—", spread: "—", misinfo: `${claims.length} claims` },
  };
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL_CLASSIFY,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You decide whether Singapore caregivers should be alerted about "${t.topic}".

Weigh three things:
1. LOCAL RELEVANCE — are there Singapore cases/clusters in the verified findings? (no local cases = lower urgency)
2. SPREAD — is the topic actively covered in Singapore now? (Singapore velocity/articles; declining = the wave is passing)
3. MISINFORMATION — how many claims, how many high-risk, are they harmful?

Verdict:
- "BROADCAST": real local relevance OR actively spreading harmful misinformation → alert now.
- "MONITOR": low local relevance or declining — watch; maybe pre-empt misinformation, don't alarm.
- "NO ACTION": not relevant to SG caregivers.

Be terse. Return ONLY JSON:
{ "verdict":"BROADCAST|MONITOR|NO ACTION", "rationale":"ONE short sentence", "urgency":"HIGH|NORMAL", "audience":"short target e.g. 'Caregivers of elderly'", "signals":{ "local":"e.g. '0 local cases' or '5 clusters'", "spread":"e.g. 'SG declining'", "misinfo":"e.g. '2 high-risk'" } }`,
          },
          {
            role: "user",
            content: `TOPIC: ${t.topic}\n\nGUIDANCE: ${advisorySummary}\n\nFINDINGS:\n${JSON.stringify(findings.map((f) => ({ agency: f.agency, stat: f.stat, text: f.text })), null, 2)}\n\nSINGAPORE COVERAGE: ${spread ? `${spread.singaporeVelocity}, ${spread.singaporeArticles} articles (global ${spread.velocityLabel}, ${spread.totalArticles}); tone ${spread.toneLabel ?? "n/a"}` : "unknown"}\n\nMISINFORMATION: ${claims.length} claims, ${highRisk} high-risk\n${JSON.stringify(claims.map((c) => ({ text: c.text, severity: c.severity })), null, 2)}`,
          },
        ],
      }),
    });
    const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
    const a = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as Partial<Assessment>;
    const verdict = a.verdict === "BROADCAST" || a.verdict === "NO ACTION" ? a.verdict : "MONITOR";
    return {
      verdict,
      rationale: a.rationale ?? fallback.rationale,
      urgency: a.urgency === "HIGH" ? "HIGH" : "NORMAL",
      audience: a.audience ?? fallback.audience,
      signals: {
        local: a.signals?.local ?? "—",
        spread: a.signals?.spread ?? "—",
        misinfo: a.signals?.misinfo ?? `${highRisk} high-risk`,
      },
    };
  } catch {
    return fallback;
  }
}

/* ─── OpenAI: generate caregiver-facing draft ─────────────────────────────── */

/** Stats lifted from the live hazard card so the draft Situation matches what
 *  the officer is actually looking at on-screen (e.g. "58,300 weekly cases ·
 *  480 senior hospitalisations · GDELT SURGING"). Passed by the route. */
export interface HazardSnapshot {
  cases?: string | number;
  casesLabel?: string;
  trend?: string;
  hospitalisations?: string | number;
  hospitalisationsLabel?: string;
  icu?: string | number;
  asOf?: string;
  source?: string;
  gdelt?: {
    mentions30d?: string | number;
    velocity?: string;
  };
}

function formatHazardSnapshot(h: HazardSnapshot): string {
  const lines: string[] = [];
  if (h.cases !== undefined) lines.push(`- ${h.cases} ${h.casesLabel ?? "cases"}${h.trend ? ` (${h.trend})` : ""}`);
  if (h.hospitalisations !== undefined) lines.push(`- ${h.hospitalisations} ${h.hospitalisationsLabel ?? "hospitalisations"}`);
  if (h.icu !== undefined) lines.push(`- ${h.icu} in ICU`);
  if (h.gdelt?.velocity) lines.push(`- Online discussion: ${h.gdelt.velocity}${h.gdelt.mentions30d !== undefined ? ` (${h.gdelt.mentions30d} mentions in last 30d)` : ""}`);
  const meta = [h.source, h.asOf].filter(Boolean).join(" · ");
  if (meta) lines.push(`- Source: ${meta}`);
  return lines.join("\n");
}

export async function generateDraft(
  t: TopicInput,
  advisorySummary: string,
  findings: Finding[],
  claims: Omit<Claim, "id">[],
  hazard?: HazardSnapshot | null,
): Promise<Draft> {
  const hazardBlock = hazard
    ? `\n\nLIVE DASHBOARD STATS (authoritative — Situation section MUST use these exact numbers, do not invent or substitute):\n${formatHazardSnapshot(hazard)}`
    : "";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: MODEL_DRAFT,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are ORCA drafting an official public-health advisory for ELDERLY CAREGIVERS in Singapore.

DASHBOARD WINS (highest-priority rule — read first)
If LIVE DASHBOARD STATS are supplied in the user message, they are the SINGLE SOURCE OF TRUTH for the Situation section. Every number, date, and trend in the Situation MUST come from the dashboard block. Do NOT use case counts, weekly totals, hospitalisation figures, or date ranges that appear in the verified findings — those findings may quote OLD MOH press releases for entirely different weeks. The dashboard reflects what the officer is looking at on screen RIGHT NOW; the findings do not.

Concretely:
- The "asOf" / date in the dashboard block IS the period to write about. If the dashboard says "as of 11 Dec 2023", the Situation is about that period — even if a finding mentions "27 April to 3 May 2025".
- Use the dashboard's "cases" + "casesLabel" verbatim (e.g. "58,300 weekly cases"). Do NOT substitute "14,200" or any other number from findings.
- Use the dashboard's "hospitalisations" + "icu" verbatim.
- Include the dashboard's "gdelt.velocity" as the spread/discussion signal (e.g. "online discussion surging" if velocity is SURGING).
- If the dashboard is absent (no live card for this topic), then and only then fall back to the verified findings for the Situation numbers.

AUDIENCE FILTER (also critical)
Caregivers are not virologists, not lab scientists, not NEA operators. OMIT — do not paraphrase, just OMIT — any verified finding that is purely:
  - virology (variant names like "JN.1 / XBB descendants", lineage classification)
  - backend surveillance (wastewater monitoring, sequencing protocols, contact-tracing infrastructure)
  - chemistry / lab science (disinfectant active ingredients, viral envelope structure, ppm concentrations)
  - policy mechanics aimed at agencies (procurement, inter-ministerial coordination)
A finding belongs in the broadcast ONLY if it leads to a clear caregiver action OR is a stat that helps the caregiver gauge risk. Caregivers care about: symptoms to watch in the elder, when to bring them to a clinic / A&E, vaccination eligibility for seniors, current case trend, hygiene basics at home, who's at high risk.

If a finding is technical, TRANSLATE it into one of those caregiver-actionable items instead of repeating it. Example: "wastewater levels rising" → "case numbers are trending up — stay alert to symptoms"; "JN.1 descendant variants dominate" → (just drop it entirely; no caregiver action).

TITLE — short, plain-language takeaway of the single most important fact (max ~8 words). State the conclusion, not a label.
  Good: "No Hantavirus outbreak in Singapore", "Dengue surging in East Region — protect the elderly"
  Bad:  "Public Health Advisory: Hantavirus Update for Caregivers of the Elderly in East Region"

BODY — labeled sections. Each label is its own line wrapped in **double asterisks**, content on the next line, sections separated by a blank line (\\n\\n). Each section 1-2 SHORT sentences. Use exactly these labels and this order:

**Situation**
What is actually happening, calmly. Use the LIVE DASHBOARD STATS verbatim if provided (do not invent different numbers). Mention the GDELT velocity ("surging discussion online") if it is in the dashboard stats.

**Facts**
The verified truth about the topic — caregiver-relevant only. After applying the audience filter above, what's left? Usually: case trend, who's most at risk, vaccination/medication eligibility for seniors.

**Misinformation spreading**
The false claim(s) circulating and a direct, plain correction. If none was detected, write "No significant misinformation detected."

**What to do**
The key protective action(s). If no action is needed, say "No special precautions needed." Always finish by naming symptoms to watch with 2-3 concrete examples (e.g. "fever above 38°C, breathlessness, drowsiness") and when to seek care (e.g. "GP within 24h, A&E if breathless").

**Sources**
List each official source on its OWN line. Each line is a markdown link using the site DOMAIN as the visible text, followed by the full agency name in parentheses. Use ONLY real urls present in the verified findings — never invent urls. Example:
[www.moh.gov.sg](https://www.moh.gov.sg) (Ministry of Health)
[www.nea.gov.sg](https://www.nea.gov.sg) (National Environment Agency)

EMPHASIS — within the section content (not the labels) you may wrap the 1-2 MOST safety-critical phrases in **double asterisks**. Use sparingly.

Other rules:
- This is a SINGAPORE national health-authority advisory addressed to Singapore residents/caregivers. Mention a sub-region (e.g. "East Region") only as a detail of WHERE the cases are — never frame the whole advisory as applying only to that sub-region.
- The "checklist" field is a SEPARATE caregiver-facing add-on (practical steps), not part of the official message.

Return ONLY JSON: { "title","body","target","urgency","checklist" }
urgency is "HIGH" or "NORMAL".`,
        },
        {
          role: "user",
          content: `TOPIC: ${t.topic}\nREGION: ${t.region}\nAUDIENCE: ${t.audience}${hazardBlock}\n\nOFFICIAL GUIDANCE:\n${advisorySummary}\n\nVERIFIED FINDINGS:\n${JSON.stringify(findings, null, 2)}\n\nCIRCULATING MISINFORMATION:\n${JSON.stringify(claims, null, 2)}`,
        },
      ],
    }),
  });

  const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
  if (!res.ok) console.error("[generateDraft] OpenAI error", res.status, JSON.stringify(data).slice(0, 240));
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const d = JSON.parse(content) as Draft;
    return {
      title: d.title ?? "[ADVISORY]",
      body: d.body ?? "",
      target: d.target ?? `${t.audience} — ${t.region}`,
      urgency: d.urgency === "NORMAL" ? "NORMAL" : "HIGH",
      checklist: d.checklist ?? [],
    };
  } catch {
    return { title: "[ADVISORY]", body: "Draft generation failed.", target: t.audience, urgency: "HIGH" };
  }
}

/* ─── OpenAI: translate an advisory into a ORCA app language ───────────────────
 * Preserves the markdown (bold **headers**, paragraph breaks, [text](url) links)
 * so the translated advisory renders identically. Returns the original on any
 * failure or unknown language. */
const TRANSLATE_LABELS: Record<string, string> = {
  zh: "Simplified Chinese (中文)",
  ms: "Bahasa Melayu (Malay)",
  id: "Bahasa Indonesia",
  tl: "Tagalog (Filipino)",
  my: "Burmese (Myanmar, မြန်မာ)",
};

export async function translateAdvisory(
  title: string,
  body: string,
  lang: string,
): Promise<{ title: string; body: string }> {
  const label = TRANSLATE_LABELS[lang];
  if (!label) return { title, body }; // English or unknown → unchanged
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL_DRAFT,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Translate this Singapore public-health advisory for ELDERLY CAREGIVERS into ${label}.
PRESERVE THE MARKDOWN STRUCTURE EXACTLY:
- Keep each **bold section header** on its own line and bold — translate the header WORDS (e.g. "**Situation**" → "**<translated word>**").
- Keep the blank lines between sections (\\n\\n).
- Keep [visible text](url) markdown links — translate the visible text, keep the URL identical.
- Keep numbers, dates, dosages, and agency names (MOH, NEA, WHO, CDC, HealthHub) unchanged.
Use a natural, clear, respectful tone for older readers. Return ONLY JSON: { "title": "...", "body": "..." }`,
          },
          { role: "user", content: `TITLE:\n${title}\n\nBODY:\n${body}` },
        ],
      }),
    });
    const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
    if (!res.ok) {
      console.error("[translateAdvisory] OpenAI error", res.status, JSON.stringify(data).slice(0, 200));
      return { title, body };
    }
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as { title?: string; body?: string };
    return { title: parsed.title || title, body: parsed.body || body };
  } catch {
    return { title, body };
  }
}
