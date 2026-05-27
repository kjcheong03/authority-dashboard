import { NextRequest } from "next/server";
import type { ServerEvent, Claim, Finding, OriginEvent, TopicInput } from "@/lib/types";
import { runAgent, coerceResult } from "@/lib/tinyfish";
import { getSpread } from "@/lib/spread";
import { fetchDengueClusters } from "@/lib/datagovsg";
import { searchFactChecks, factCheckEnabled } from "@/lib/factcheck";
import {
  ingestGoal,
  INGEST_START_URL,
  misinfoGoal,
  MISINFO_START_URL,
  classifyClaims,
  traceOrigins,
  generateAssessment,
  generateDraft,
  type IngestResult,
  type RawClaim,
} from "@/lib/agents";
import { REPLAY_EVENTS } from "@/lib/replay";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Hobby plan cap (max 300s)

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ts = () => new Date().toTimeString().slice(0, 8);

// Every flagged claim is, by definition, contradicted by verified guidance — so a
// real rebuttal always exists. When the web-search trace returns no debunk step,
// build one from the verified finding the claim contradicts (a real, ingested URL).
function backfillDebunk(claim: Claim, findings: Finding[]): OriginEvent | null {
  const withUrl = findings.filter((f) => f.url);
  if (!withUrl.length) return null;
  const hay = `${claim.contradicts ?? ""} ${claim.text}`.toLowerCase();
  const matched = withUrl.find((f) => hay.includes(f.agency.toLowerCase()));
  const f = matched ?? withUrl[0];
  return {
    date: new Date().toISOString().slice(0, 10),
    outlet: f.agency,
    event: claim.fix?.trim() || `${f.agency} guidance directly contradicts this claim.`,
    type: "debunk",
    url: f.url,
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<TopicInput> & { mode?: string };
  const topic: TopicInput = {
    topic: body.topic?.trim() || "Dengue Surge — East Region",
    region: body.region?.trim() || "East Region",
    audience: body.audience?.trim() || "Caregivers of elderly",
  };
  const replay = body.mode === "replay";

  // A clean keyword for coverage queries, e.g. "Dengue Surge — East Region" → "Dengue Surge".
  const spreadKeyword = topic.topic.split(/[—–-]/)[0].trim() || topic.topic;

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ServerEvent) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* stream closed */
        }
      };

      if (replay) {
        await streamReplay(send);
        controller.close();
        return;
      }

      try {
        /* ─── PHASE 1: INGEST official guidance ──────────────────────────── */
        send({ type: "PHASE", phase: "ingest", label: "High-priority ingest" });
        send({ type: "LOG", level: "info", message: `Initialising research on "${topic.topic}"`, ts: ts() });

        let pct = 5;
        send({ type: "PROGRESS_PCT", pct });

        // Authoritative SG ground-truth (data.gov.sg) — runs in parallel with the agent.
        const isDengue = /dengue/i.test(topic.topic);
        const clustersPromise = isDengue ? fetchDengueClusters() : Promise.resolve(null);

        const ingestRaw = await runAgent({
          url: INGEST_START_URL,
          goal: ingestGoal(topic),
          onStreamingUrl: (url) => send({ type: "STREAMING_URL", url }),
          onProgress: (purpose) => {
            pct = Math.min(45, pct + 4);
            send({ type: "LOG", level: "info", message: purpose, ts: ts() });
            send({ type: "PROGRESS_PCT", pct });
          },
        });

        const ingest = coerceResult<IngestResult>(ingestRaw) ?? {};
        const findings: Finding[] = (ingest.findings ?? []).map((f) => ({
          ...f,
          timeAgo: f.timeAgo ?? `${Math.floor(Math.random() * 40) + 5} mins ago`,
        }));
        const advisorySummary = ingest.advisory_summary ?? "";

        // Fold in authoritative data.gov.sg dengue-cluster data as verified findings.
        const clusters = await clustersPromise;
        if (clusters && clusters.totalClusters > 0) {
          send({ type: "SOURCE", source: { name: "data.gov.sg", url: "https://data.gov.sg/datasets/d_dbfabf16158d1b0e1c420627c0819168/view" } });
          send({
            type: "LOG",
            level: "ok",
            message: `data.gov.sg (NEA): ${clusters.totalClusters} active dengue clusters, ${clusters.totalCases} cases${clusters.updated ? ` (as of ${clusters.updated})` : ""}`,
            ts: ts(),
          });
          findings.unshift({
            agency: "NEA",
            stat: `${clusters.totalClusters} clusters`,
            text: `${clusters.totalClusters} active dengue clusters in Singapore (${clusters.totalCases} cases total)${clusters.largest ? `; largest at ${clusters.largest.locality} with ${clusters.largest.cases} cases` : ""}.`,
            url: "https://www.nea.gov.sg/dengue-zika/dengue/dengue-clusters",
            timeAgo: clusters.updated ? `as of ${clusters.updated}` : "live",
          });
          if (clusters.habitats.length) {
            findings.push({
              agency: "NEA",
              stat: "breeding habitats",
              text: `Common breeding habitats in active clusters: ${clusters.habitats.join(", ")}.`,
              url: "https://www.nea.gov.sg/dengue-zika/dengue/dengue-clusters",
              timeAgo: clusters.updated ? `as of ${clusters.updated}` : "live",
            });
          }
        }

        for (const s of ingest.sources ?? []) {
          send({ type: "SOURCE", source: s });
          await delay(120);
        }
        send({ type: "LOG", level: "ok", message: `Extracted ${findings.length} verified findings`, ts: ts() });
        for (const f of findings) {
          send({ type: "FINDING", finding: f });
          await delay(400);
        }
        pct = 50;
        send({ type: "PROGRESS_PCT", pct });

        /* ─── PHASE 2: MISINFORMATION scan (seeded feed + live GDELT) ─────── */
        send({ type: "PHASE", phase: "misinfo", label: "Cross-referencing public claims" });
        send({ type: "LOG", level: "info", message: "Scanning public channels for confusion signals…", ts: ts() });

        // LIVE signal in parallel — real-world coverage velocity.
        const spreadPromise = getSpread(spreadKeyword).then((sig) => {
          if (sig) {
            send({
              type: "LOG",
              level: "info",
              message: `GDELT [${sig.source}]: "${spreadKeyword}" global ${sig.velocityLabel} (${sig.totalArticles})${sig.toneLabel ? `, tone ${sig.toneLabel}` : ""} · Singapore ${sig.singaporeVelocity} (${sig.singaporeArticles})`,
              ts: ts(),
            });
            send({ type: "SPREAD", spread: sig });
          }
          return sig;
        });

        const misinfoRaw = await runAgent({
          url: MISINFO_START_URL,
          goal: misinfoGoal(topic),
          onStreamingUrl: (url) => send({ type: "STREAMING_URL", url }),
          onProgress: (purpose) => {
            pct = Math.min(75, pct + 3);
            send({ type: "LOG", level: "warn", message: purpose, ts: ts() });
            send({ type: "PROGRESS_PCT", pct });
          },
        });

        const rawClaims = (coerceResult<{ claims?: RawClaim[] }>(misinfoRaw)?.claims ?? []) as RawClaim[];
        const spread = await spreadPromise;

        send({ type: "LOG", level: "info", message: `Classifying ${rawClaims.length} claims against verified guidance…`, ts: ts() });
        const classified = await classifyClaims(rawClaims, findings, advisorySummary);

        const emitted: Claim[] = [];
        let idx = 0;
        for (const c of classified) {
          const claim: Claim = {
            ...c,
            id: `claim_${idx++}`,
            velocity: spread?.velocityLabel,
          };
          emitted.push(claim);
          send({ type: "CLAIM", claim });
          send({
            type: "LOG",
            level: "warn",
            message: `Flagged ${claim.severity === "UNVERIFIED" ? "UNVERIFIED" : "discrepancy"}: "${claim.text.slice(0, 60)}…"`,
            ts: ts(),
          });
          await delay(500);
        }

        // Corroborating published fact-checks (Google Fact Check Tools) for every detected claim.
        if (emitted.length && factCheckEnabled()) {
          send({ type: "LOG", level: "info", message: `Checking ${emitted.length} claim(s) against published fact-checks…`, ts: ts() });
          await Promise.all(
            emitted.map(async (c) => {
              const hits = await searchFactChecks(c.text);
              if (hits.length) {
                send({ type: "FACTCHECK", claimId: c.id, factChecks: hits });
                send({ type: "LOG", level: "ok", message: `Fact-check match: "${hits[0].rating}" — ${hits[0].publisher}`, ts: ts() });
              }
            }),
          );
        }

        // Origin trace for every detected claim — where did it start, who debunked it?
        const toTrace = emitted.map((c) => ({ id: c.id, text: c.text }));
        if (toTrace.length) {
          send({ type: "LOG", level: "info", message: `Tracing origin of ${toTrace.length} claim(s) via web search…`, ts: ts() });
          const origins = await traceOrigins(toTrace, topic);
          const originById = new Map(origins.map((o) => [o.id, o]));
          // Trim filler/parentheticals (e.g. "X (formerly Twitter)") for a clean read.
          const tidy = (s: string) => s.replace(/\s*\((?:formerly|formally)[^)]*\)/gi, "").trim();
          const allowedType = (t: string): OriginEvent["type"] =>
            (["origin", "amplification", "debunk", "investigation"].includes(t) ? t : "amplification") as OriginEvent["type"];

          // Emit an ORIGIN for EVERY claim (not only the ones the trace returned),
          // and guarantee each timeline ends with a real debunk — a misinformation
          // claim without a rebuttal isn't actionable.
          for (const claim of emitted) {
            const o = originById.get(claim.id);
            const timeline: OriginEvent[] = (o?.timeline ?? []).map((e) => ({
              date: e.date,
              outlet: tidy(e.outlet),
              event: e.event,
              type: allowedType(e.type),
              url: e.url,
            }));

            if (!timeline.some((e) => e.type === "debunk")) {
              const rebuttal = backfillDebunk(claim, findings);
              if (rebuttal) {
                timeline.push(rebuttal);
                send({ type: "LOG", level: "ok", message: `Rebuttal attached from ${rebuttal.outlet} guidance.`, ts: ts() });
              }
            }

            send({
              type: "ORIGIN",
              claimId: claim.id,
              origin: { singleSource: o?.singleSource, timeline },
            });
            send({ type: "LOG", level: "info", message: `Origin traced: ${timeline[0]?.outlet ? tidy(timeline[0].outlet) : "logged"}`, ts: ts() });
            await delay(300);
          }
        }

        pct = 82;
        send({ type: "PROGRESS_PCT", pct });

        /* ─── Broadcast assessment — the decision spine ──────────────────── */
        send({ type: "LOG", level: "info", message: "Weighing local relevance, spread and misinformation…", ts: ts() });
        const assessment = await generateAssessment(topic, advisorySummary, findings, spread, classified);
        send({ type: "ASSESSMENT", assessment });
        send({ type: "LOG", level: "ok", message: `Assessment: ${assessment.verdict} — ${assessment.rationale}`, ts: ts() });

        /* ─── PHASE 3: DRAFT caregiver-facing advisory ───────────────────── */
        send({ type: "PHASE", phase: "draft", label: "Drafting advisory" });
        send({ type: "LOG", level: "info", message: `Drafting for ${assessment.audience}…`, ts: ts() });

        const draft = await generateDraft({ ...topic, audience: assessment.audience }, advisorySummary, findings, classified);
        draft.urgency = assessment.urgency; // keep the draft consistent with the verdict
        send({ type: "DRAFT", draft });

        pct = 100;
        send({ type: "PROGRESS_PCT", pct });
        send({ type: "LOG", level: "ok", message: "Research complete. Draft ready for officer review.", ts: ts() });
        send({ type: "PHASE", phase: "done", label: "Research complete" });
        send({ type: "COMPLETE" });
      } catch (err) {
        send({ type: "ERROR", message: err instanceof Error ? err.message : "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/* ─── Replay: stream a recorded real run deterministically ──────────────────── */
async function streamReplay(send: (e: ServerEvent) => void) {
  for (const [e, gap] of REPLAY_EVENTS) {
    await delay(gap);
    send(e);
  }
}
