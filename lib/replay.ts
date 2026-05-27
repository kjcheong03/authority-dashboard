/* ───────────────────────────────────────────────────────────────────────────
 * Deterministic replay of a representative real run. Used as the stage-safe
 * fallback (?mode=replay) and for UI development without spending credits.
 *
 * Each entry is [event, gapMsBeforeIt]. Mirrors the dengue / East Region
 * scenario from the product mockup.
 * ─────────────────────────────────────────────────────────────────────────── */

import type { ServerEvent } from "./types";

export const REPLAY_EVENTS: Array<[ServerEvent, number]> = [
  [{ type: "PHASE", phase: "ingest", label: "High-priority ingest" }, 100],
  [{ type: "LOG", level: "info", message: 'Initialising research on "Dengue Surge — East Region"', ts: "14:02:01" }, 300],
  [{ type: "PROGRESS_PCT", pct: 8 }, 100],
  [{ type: "LOG", level: "info", message: 'Search moh.gov.sg databases: "Dengue cluster statistics East 2024"', ts: "14:02:18" }, 700],
  [{ type: "PROGRESS_PCT", pct: 18 }, 200],
  [{ type: "LOG", level: "info", message: "Read moh.gov.sg/news-highlights/dengue-advisory-v2.pdf …", ts: "14:02:31" }, 900],
  [{ type: "SOURCE", source: { name: "MOH", url: "https://www.moh.gov.sg" } }, 200],
  [{ type: "SOURCE", source: { name: "NEA", url: "https://www.nea.gov.sg" } }, 150],
  [{ type: "SOURCE", source: { name: "gov.sg", url: "https://www.gov.sg" } }, 150],
  [{ type: "PROGRESS_PCT", pct: 32 }, 200],
  [{ type: "SOURCE", source: { name: "data.gov.sg", url: "https://data.gov.sg/datasets/d_dbfabf16158d1b0e1c420627c0819168/view" } }, 150],
  [{ type: "LOG", level: "ok", message: "data.gov.sg (NEA): 5 active dengue clusters, 96 cases (as of 2026-05-22)", ts: "14:02:50" }, 600],
  [
    {
      type: "FINDING",
      finding: { agency: "NEA", stat: "5 clusters", text: "5 active dengue clusters in Singapore (96 cases total); largest at Tampines St 21 with 41 cases.", timeAgo: "as of 2026-05-22", url: "https://www.nea.gov.sg/dengue-zika/dengue/dengue-clusters" },
    },
    400,
  ],
  [{ type: "LOG", level: "info", message: "Cross-referencing NEA thermal mapping for Tampines North …", ts: "14:03:02" }, 900],
  [{ type: "PROGRESS_PCT", pct: 45 }, 200],
  [{ type: "LOG", level: "ok", message: "Extracted 3 verified findings", ts: "14:03:20" }, 500],
  [
    {
      type: "FINDING",
      finding: { agency: "MOH", stat: "R0 1.42", text: "Current R0 in Tampines North is 1.42, exceeding the safety threshold of 1.0.", timeAgo: "12 mins ago", url: "https://www.moh.gov.sg" },
    },
    500,
  ],
  [
    {
      type: "FINDING",
      finding: { agency: "NEA", stat: "48 blocks", text: "High mosquito population density detected in 48 blocks across Pasir Ris Drive 3.", timeAgo: "30 mins ago", url: "https://www.nea.gov.sg" },
    },
    500,
  ],
  [{ type: "PROGRESS_PCT", pct: 50 }, 200],

  [{ type: "PHASE", phase: "misinfo", label: "Cross-referencing public claims" }, 600],
  [{ type: "LOG", level: "info", message: "Scanning public channels for confusion signals…", ts: "14:03:48" }, 500],
  [{ type: "LOG", level: "info", message: "GDELT: dengue coverage RISING (143 articles, Singapore, Malaysia)", ts: "14:03:55" }, 600],
  [
    {
      type: "SPREAD",
      spread: {
        velocityLabel: "RISING",
        totalArticles: 143,
        topCountries: ["Singapore", "Malaysia", "Indonesia"],
        singaporeArticles: 38,
        singaporeVelocity: "SURGING",
        toneLabel: "ALARMIST",
        avgTone: -5.8,
        source: "bigquery",
        timeline: [
          { date: "2026-05-09", global: 3, sg: 0, tone: -3.1 },
          { date: "2026-05-10", global: 4, sg: 1, tone: -3.4 },
          { date: "2026-05-11", global: 5, sg: 1, tone: -4.0 },
          { date: "2026-05-12", global: 6, sg: 2, tone: -4.3 },
          { date: "2026-05-13", global: 8, sg: 2, tone: -4.9 },
          { date: "2026-05-14", global: 9, sg: 3, tone: -5.1 },
          { date: "2026-05-15", global: 11, sg: 3, tone: -5.4 },
          { date: "2026-05-16", global: 12, sg: 4, tone: -5.6 },
          { date: "2026-05-17", global: 14, sg: 4, tone: -5.9 },
          { date: "2026-05-18", global: 16, sg: 5, tone: -6.2 },
          { date: "2026-05-19", global: 18, sg: 5, tone: -6.0 },
          { date: "2026-05-20", global: 15, sg: 4, tone: -5.7 },
          { date: "2026-05-21", global: 13, sg: 4, tone: -5.5 },
          { date: "2026-05-22", global: 9, sg: 3, tone: -5.2 },
        ],
      },
    },
    100,
  ],
  [{ type: "LOG", level: "warn", message: 'Warning: detected high-velocity claim regarding "papaya leaf juice" on social feeds…', ts: "14:04:10" }, 900],
  [{ type: "PROGRESS_PCT", pct: 66 }, 200],
  [{ type: "LOG", level: "info", message: "Classifying 3 claims against verified guidance…", ts: "14:04:30" }, 700],
  [
    {
      type: "CLAIM",
      claim: {
        id: "claim_0",
        text: "Boiling papaya leaves and drinking the juice is the only way to survive the East dengue surge.",
        severity: "UNVERIFIED",
        where: "WhatsApp",
        shares: "3.2k shares",
        contradicts: "MOH advisory: no home remedy cures or prevents dengue; seek medical care for warning signs.",
        analysis: "Potential dangerous home-remedy myth — discourages people from seeking medical care.",
        fix: "State clearly there is no proven home cure; list dengue warning signs and when to see a doctor.",
        velocity: "RISING",
      },
    },
    600,
  ],
  [{ type: "LOG", level: "warn", message: 'Flagged UNVERIFIED: "Boiling papaya leaves and drinking the juice…"', ts: "14:04:42" }, 200],
  [
    {
      type: "CLAIM",
      claim: {
        id: "claim_1",
        text: "NEA chemical spraying scheduled for Tampines has been cancelled due to budget…",
        severity: "MINOR_DISCREPANCY",
        where: "community forum",
        shares: "later resolved",
        contradicts: "NEA vector-control operations in Tampines clusters are ongoing as scheduled.",
        analysis: "Outdated/incorrect — could reduce resident cooperation with fogging operations.",
        fix: "Confirm fogging schedule is active and ask residents to keep windows open during operations.",
        velocity: "RISING",
      },
    },
    600,
  ],
  [
    {
      type: "CLAIM",
      claim: {
        id: "claim_2",
        text: "Dengue only affects children, so elderly residents don't need to take precautions.",
        severity: "UNVERIFIED",
        where: "messaging groups",
        shares: "850 shares",
        contradicts: "MOH: elderly are at higher risk of severe dengue and complications.",
        analysis: "False — elderly are among the highest-risk groups for severe dengue.",
        fix: "Emphasise elderly are high-risk; caregivers should monitor for warning signs closely.",
        velocity: "RISING",
      },
    },
    600,
  ],
  [{ type: "LOG", level: "info", message: "Checking 2 claim(s) against published fact-checks…", ts: "14:04:50" }, 600],
  [
    {
      type: "FACTCHECK",
      claimId: "claim_0",
      factChecks: [
        { publisher: "AFP Fact Check", rating: "False", title: "Papaya leaf juice does not cure or prevent dengue", url: "https://factcheck.afp.com/" },
        { publisher: "Reuters Fact Check", rating: "Misleading", title: "No evidence papaya leaves cure dengue", url: "https://www.reuters.com/fact-check/" },
      ],
    },
    400,
  ],
  [{ type: "LOG", level: "ok", message: 'Fact-check match: "False" — AFP Fact Check', ts: "14:04:54" }, 300],
  [
    {
      type: "FACTCHECK",
      claimId: "claim_2",
      factChecks: [{ publisher: "AFP Fact Check", rating: "False", title: "Dengue affects all age groups, including the elderly", url: "https://factcheck.afp.com/" }],
    },
    400,
  ],
  [{ type: "LOG", level: "ok", message: 'Fact-check match: "False" — AFP Fact Check', ts: "14:04:56" }, 300],
  [{ type: "LOG", level: "info", message: "Tracing origin of 3 claim(s) via web search…", ts: "14:04:58" }, 700],
  [
    {
      type: "ORIGIN",
      claimId: "claim_1",
      origin: {
        singleSource: false,
        timeline: [
          { date: "2026-05-14", outlet: "community forum", event: "Resident posts that fogging was cancelled 'due to budget'.", type: "origin", url: "https://www.hardwarezone.com.sg/" },
          { date: "2026-05-17", outlet: "NEA", event: "NEA confirms vector-control operations are ongoing as scheduled.", type: "debunk", url: "https://www.nea.gov.sg/dengue-zika/dengue/dengue-clusters" },
        ],
      },
    },
    500,
  ],
  [{ type: "LOG", level: "info", message: "Origin traced: community forum", ts: "14:05:01" }, 300],
  [
    {
      type: "ORIGIN",
      claimId: "claim_0",
      origin: {
        singleSource: true,
        timeline: [
          { date: "2026-05-12", outlet: "WhatsApp", event: "Original 'papaya leaf cures dengue' message recirculated to family chats.", type: "origin", url: "https://www.whatsapp.com/" },
          { date: "2026-05-15", outlet: "Facebook", event: "Reshared with 'East dengue surge' framing; shares climb past 3k.", type: "amplification", url: "https://www.facebook.com/" },
          { date: "2026-05-18", outlet: "Mothership", event: "Local outlet flags it as an unproven remedy.", type: "debunk", url: "https://mothership.sg/" },
        ],
      },
    },
    500,
  ],
  [{ type: "LOG", level: "info", message: "Origin traced: WhatsApp forward", ts: "14:05:04" }, 300],
  [
    {
      type: "ORIGIN",
      claimId: "claim_2",
      origin: {
        singleSource: false,
        timeline: [
          { date: "2026-05-10", outlet: "Telegram", event: "Infographic on child cases miscaptioned as 'only children at risk'.", type: "origin", url: "https://telegram.org/" },
          { date: "2026-05-16", outlet: "r/singapore", event: "Quoted in a thread; partially corrected by other users.", type: "investigation", url: "https://www.reddit.com/r/singapore/" },
          { date: "2026-05-19", outlet: "WHO", event: "WHO fact sheet confirms dengue affects all age groups.", type: "debunk", url: "https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue" },
        ],
      },
    },
    500,
  ],
  [{ type: "LOG", level: "info", message: "Origin traced: Telegram health group", ts: "14:05:09" }, 300],
  [{ type: "PROGRESS_PCT", pct: 82 }, 200],

  [{ type: "LOG", level: "info", message: "Weighing local relevance, spread and misinformation…", ts: "14:05:08" }, 600],
  [
    {
      type: "ASSESSMENT",
      assessment: {
        verdict: "BROADCAST",
        rationale: "Active NEA dengue clusters in the East plus rising local chatter and a dangerous fake-cure — alert caregivers now.",
        urgency: "HIGH",
        audience: "Caregivers of elderly — East Region",
        signals: { local: "5 clusters, 96 cases", spread: "SG rising", misinfo: "2 high-risk" },
      },
    },
    600,
  ],
  [{ type: "LOG", level: "ok", message: "Assessment: BROADCAST — alert caregivers now", ts: "14:05:13" }, 400],
  [{ type: "PHASE", phase: "draft", label: "Drafting advisory" }, 500],
  [{ type: "LOG", level: "info", message: "Drafting for Caregivers of elderly…", ts: "14:05:15" }, 800],
  [
    {
      type: "DRAFT",
      draft: {
        title: "Dengue surging in the East — protect the elderly",
        target: "Caregivers of elderly — East Region",
        urgency: "HIGH",
        body: "**Situation**\nDengue cases are rising sharply in the Tampines and Pasir Ris clusters.\n\n**Facts**\nNEA fogging operations in these areas are ongoing as scheduled, and **elderly residents are at higher risk of severe dengue**.\n\n**Misinformation spreading**\nMessages claim papaya leaf juice cures dengue. **There is no home remedy that cures or prevents dengue** — please disregard these claims.\n\n**What to do**\nClear standing water weekly and apply repellent on elderly residents. Watch for high fever, severe abdominal pain, or bleeding, and seek care immediately if these appear.\n\n**Sources**\n[www.moh.gov.sg](https://www.moh.gov.sg) (Ministry of Health)\n[www.nea.gov.sg](https://www.nea.gov.sg/dengue-zika/dengue/dengue-clusters) (National Environment Agency)",
        checklist: [
          "Remove stagnant water from trays, pots, and gutters weekly.",
          "Apply repellent on elderly residents, especially mornings and evenings.",
          "Watch for warning signs: high fever, severe abdominal pain, bleeding — seek care immediately.",
          "Keep windows open during scheduled NEA fogging.",
        ],
      },
    },
    700,
  ],
  [{ type: "PROGRESS_PCT", pct: 100 }, 200],
  [{ type: "LOG", level: "ok", message: "Research complete. Draft ready for officer review.", ts: "14:05:40" }, 300],
  [{ type: "PHASE", phase: "done", label: "Research complete" }, 100],
  [{ type: "COMPLETE" }, 100],
];
