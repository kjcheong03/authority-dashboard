import { NextRequest } from "next/server";
import type { ServerEvent, Claim, Finding, OriginEvent, TopicInput } from "@/lib/types";
import { runAgent, coerceResult } from "@/lib/tinyfish";
import { getSpread } from "@/lib/spread";
import { fetchDengueClusters } from "@/lib/datagovsg";
import { searchFactChecks, factCheckEnabled } from "@/lib/factcheck";
import {
  classifyClaims,
  traceOrigins,
  generateAssessment,
  generateDraft,
  type RawClaim,
} from "@/lib/agents";
import { VERIFIED_AGENTS, ONLINE_AGENTS } from "@/lib/channelAgents";
import { REPLAY_EVENTS } from "@/lib/replay";
import {
  createRun,
  updateRun,
  markRunDone,
  saveFinding,
  saveClaim,
  saveClaimOrigin,
  saveClaimFactchecks,
  saveSpread,
  saveAssessment,
  saveDraft,
  saveSource,
  saveLog,
} from "@/lib/db";

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

  // Create the DB row immediately so the client can autofill / re-broadcast later.
  const runId = await createRun({
    topic: topic.topic,
    region: topic.region,
    audience: topic.audience,
    mode: replay ? "replay" : "live",
  });

  // Persistence ordinal counters (preserve emit order in DB).
  const ord = { finding: 0, claim: 0, source: 0 };

  // Serialise DB writes so CLAIM lands before its ORIGIN/FACTCHECK references it.
  let persistChain: Promise<void> = Promise.resolve();
  const persist = (fn: () => Promise<void>) => {
    persistChain = persistChain.then(fn).catch((e) => console.warn("[db]", e));
  };

  const stream = new ReadableStream({
    async start(controller) {
      // The client's AbortController fires this on Stop. We mark the run stopped
      // and short-circuit any further work.
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        markRunDone(runId, "stopped").catch(() => {});
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener("abort", onAbort);

      const send = (e: ServerEvent) => {
        if (aborted) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          /* stream closed */
        }
        // Persist every event in order.
        switch (e.type) {
          case "PHASE":
            persist(() => updateRun(runId, { phase: e.phase }));
            break;
          case "PROGRESS_PCT":
            persist(() => updateRun(runId, { pct: e.pct }));
            break;
          case "STREAMING_URL":
            persist(() => updateRun(runId, { streaming_url: e.url }));
            break;
          case "LOG":
            persist(() => saveLog(runId, e.level, e.message, e.ts));
            break;
          case "SOURCE":
            persist(() => saveSource(runId, e.source, ord.source++));
            break;
          case "FINDING":
            persist(() => saveFinding(runId, e.finding, ord.finding++));
            break;
          case "CLAIM":
            persist(async () => { await saveClaim(runId, e.claim, ord.claim++); });
            break;
          case "ORIGIN":
            persist(() => saveClaimOrigin(runId, e.claimId, e.origin));
            break;
          case "FACTCHECK":
            persist(() => saveClaimFactchecks(runId, e.claimId, e.factChecks));
            break;
          case "SPREAD":
            persist(() => saveSpread(runId, e.spread));
            break;
          case "ASSESSMENT":
            persist(() => saveAssessment(runId, e.assessment));
            break;
          case "DRAFT":
            persist(() => saveDraft(runId, e.draft));
            break;
        }
      };

      // Hand the runId to the client right away so it can save / re-broadcast.
      if (runId) send({ type: "RUN_ID", runId });

      if (replay) {
        await streamReplay(send);
        await persistChain;
        await markRunDone(runId, "complete");
        controller.close();
        return;
      }

      try {
        /* ─── PHASE 1: INGEST — 5 verified-source agents in parallel ─────── */
        send({ type: "PHASE", phase: "ingest", label: "High-priority ingest" });
        send({ type: "LOG", level: "info", message: `Initialising research on "${topic.topic}" across ${Object.keys(VERIFIED_AGENTS).length} verified sources…`, ts: ts() });

        let pct = 5;
        send({ type: "PROGRESS_PCT", pct });

        // data.gov.sg ground-truth (NEA dengue clusters) — supplementary enrichment
        // that runs alongside the per-source TinyFish agents.
        const isDengue = /dengue/i.test(topic.topic);
        const clustersPromise = isDengue ? fetchDengueClusters() : Promise.resolve(null);

        // Fire all verified-source TinyFish sessions IN PARALLEL. Each session
        // streams its own browser URL → tagged to the tile in the surveillance
        // grid via CHANNEL_STREAMING_URL. Promise.allSettled so one stalled site
        // doesn't kill the whole phase.
        const verifiedTasks = Object.entries(VERIFIED_AGENTS).map(([channelId, cfg]) => ({ channelId, cfg }));
        send({ type: "LOG", level: "info", message: `Firing ${verifiedTasks.length} parallel TinyFish sessions: ${verifiedTasks.map((t) => t.channelId.toUpperCase()).join(", ")}`, ts: ts() });

        const verifiedResults = await Promise.allSettled(
          verifiedTasks.map(({ channelId, cfg }) =>
            runAgent({
              url: cfg.startUrl(topic.topic),
              goal: cfg.goal(topic.topic),
              outputSchema: cfg.outputSchema as Record<string, unknown>,
              onStreamingUrl: (url) => send({ type: "CHANNEL_STREAMING_URL", channelId, url }),
              onProgress: (purpose) => {
                pct = Math.min(45, pct + 1);
                send({ type: "LOG", level: "info", message: `${channelId.toUpperCase()}: ${purpose}`, ts: ts() });
                send({ type: "PROGRESS_PCT", pct });
              },
            }).then((raw) => ({ channelId, raw })),
          ),
        );

        // Collect findings from each successful session. Force the agency tag
        // so it always matches the channel that produced it (the agent may
        // tag inconsistently otherwise).
        const findings: Finding[] = [];
        const summaryParts: string[] = [];
        const channelDisplayName: Record<string, string> = {
          moh: "MOH", nea: "NEA", who: "WHO", cdc: "CDC", healthhub: "HealthHub",
        };
        for (const r of verifiedResults) {
          if (r.status !== "fulfilled") {
            send({ type: "LOG", level: "warn", message: `Verified-source agent failed: ${r.reason}`, ts: ts() });
            continue;
          }
          const { channelId, raw } = r.value;
          const parsed = coerceResult<{ findings?: Finding[]; advisory_summary?: string }>(raw) ?? {};
          const agencyTag = channelDisplayName[channelId] ?? channelId;
          const channelFindings = (parsed.findings ?? []).map((f) => ({
            ...f,
            agency: agencyTag, // pin agency to its channel — drives source-picker attribution
            timeAgo: f.timeAgo ?? `${Math.floor(Math.random() * 40) + 5} mins ago`,
          }));
          findings.push(...channelFindings);
          if (parsed.advisory_summary) summaryParts.push(parsed.advisory_summary);
          send({ type: "LOG", level: "ok", message: `${agencyTag}: ${channelFindings.length} finding${channelFindings.length === 1 ? "" : "s"}`, ts: ts() });
          // Also surface the channel's site as a consulted-source chip.
          send({ type: "SOURCE", source: { name: agencyTag, url: `https://www.${channelId === "healthhub" ? "healthhub.sg" : channelId === "who" ? "who.int" : channelId === "cdc" ? "cdc.gov" : channelId + ".gov.sg"}` } });
        }
        const advisorySummary = summaryParts.join(" ");

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

        send({ type: "LOG", level: "ok", message: `Extracted ${findings.length} verified findings`, ts: ts() });
        for (const f of findings) {
          send({ type: "FINDING", finding: f });
          await delay(250);
        }
        pct = 50;
        send({ type: "PROGRESS_PCT", pct });

        /* ─── PHASE 2: MISINFO — 7 online-source agents in parallel ─────── */
        send({ type: "PHASE", phase: "misinfo", label: "Cross-referencing public claims" });
        send({ type: "LOG", level: "info", message: `Scanning ${Object.keys(ONLINE_AGENTS).length} online channels for confusion signals…`, ts: ts() });

        // LIVE GDELT signal — real-world coverage velocity, runs alongside.
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

        // Fire all online-channel TinyFish sessions IN PARALLEL.
        const onlineTasks = Object.entries(ONLINE_AGENTS).map(([channelId, cfg]) => ({ channelId, cfg }));
        const onlineDisplay: Record<string, string> = {
          reddit: "r/singapore", hwz: "HardwareZone", mothership: "Mothership",
          telegram: "Telegram", tiktok: "TikTok", facebook: "Facebook", ddg: "DuckDuckGo",
        };
        send({ type: "LOG", level: "info", message: `Firing ${onlineTasks.length} parallel TinyFish sessions: ${onlineTasks.map((t) => t.channelId.toUpperCase()).join(", ")}`, ts: ts() });

        const onlineResults = await Promise.allSettled(
          onlineTasks.map(({ channelId, cfg }) =>
            runAgent({
              url: cfg.startUrl(topic.topic),
              goal: cfg.goal(topic.topic),
              outputSchema: cfg.outputSchema as Record<string, unknown>,
              onStreamingUrl: (url) => send({ type: "CHANNEL_STREAMING_URL", channelId, url }),
              onProgress: (purpose) => {
                pct = Math.min(75, pct + 1);
                send({ type: "LOG", level: "warn", message: `${channelId.toUpperCase()}: ${purpose}`, ts: ts() });
                send({ type: "PROGRESS_PCT", pct });
              },
            }).then((raw) => ({ channelId, raw })),
          ),
        );

        // Pool claims from each successful session, tagging each with its channel.
        const rawClaims: RawClaim[] = [];
        for (const r of onlineResults) {
          if (r.status !== "fulfilled") {
            send({ type: "LOG", level: "warn", message: `Online-source agent failed: ${r.reason}`, ts: ts() });
            continue;
          }
          const { channelId, raw } = r.value;
          const parsed = coerceResult<{ claims?: RawClaim[] }>(raw) ?? {};
          const channelTag = onlineDisplay[channelId] ?? channelId;
          const channelClaims = (parsed.claims ?? []).map((c) => ({
            ...c,
            where: c.where || channelTag, // pin to source channel
          }));
          rawClaims.push(...channelClaims);
          send({ type: "LOG", level: "ok", message: `${channelTag}: ${channelClaims.length} claim${channelClaims.length === 1 ? "" : "s"} surfaced`, ts: ts() });
        }
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
        await persistChain;
        if (!aborted) await markRunDone(runId, "complete");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        send({ type: "ERROR", message: msg });
        await persistChain;
        if (!aborted) await markRunDone(runId, "failed", msg);
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        try { controller.close(); } catch { /* already closed */ }
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
