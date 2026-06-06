import { NextRequest } from "next/server";
import type { ServerEvent, Claim, Finding, TopicInput } from "@/lib/types";
import { runAgent, coerceResult, cancelRuns, getRunSteps } from "@/lib/tinyfish";
import { getSpread } from "@/lib/spread";
import { fetchDengueClusters } from "@/lib/datagovsg";
import {
  classifyClaims,
  generateAssessment,
  generateDraft,
  generateFallbackClaims,
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
  saveChannelSession,
} from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Hobby plan cap (max 300s)

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ts = () => new Date().toTimeString().slice(0, 8);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<TopicInput> & {
    mode?: string;
    hazardSnapshot?: import("@/lib/agents").HazardSnapshot;
  };
  const topic: TopicInput = {
    topic: body.topic?.trim() || "Dengue Surge — East Region",
    region: body.region?.trim() || "Singapore",
    audience: body.audience?.trim() || "Caregivers of elderly",
  };
  const replay = body.mode === "replay";
  const hazardSnapshot = body.hazardSnapshot ?? null;

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

  // Every TinyFish session's run_id collected via the STARTED event — so a Stop
  // click bulk-cancels them all instead of letting them run to budget.
  const activeTinyfishRuns = new Set<string>();

  // Serialise DB writes so CLAIM lands before any later references.
  let persistChain: Promise<void> = Promise.resolve();
  const persist = (fn: () => Promise<void>) => {
    persistChain = persistChain.then(fn).catch((e) => console.warn("[db]", e));
  };

  const stream = new ReadableStream({
    async start(controller) {
      // The client's AbortController fires this on Stop. We mark the run stopped,
      // tell TinyFish to kill every in-flight browser session, and short-circuit.
      let aborted = false;
      const onAbort = () => {
        aborted = true;
        markRunDone(runId, "stopped").catch(() => {});
        if (activeTinyfishRuns.size) cancelRuns([...activeTinyfishRuns]).catch(() => {});
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

        const verifiedRuns: Record<string, string | undefined> = {};
        const verifiedResults = await Promise.allSettled(
          verifiedTasks.map(({ channelId, cfg }) =>
            runAgent({
              url: cfg.startUrl(topic.topic),
              goal: cfg.goal(topic.topic),
              outputSchema: cfg.outputSchema as Record<string, unknown>,
              onStarted: (rid) => { verifiedRuns[channelId] = rid; activeTinyfishRuns.add(rid); },
              onStreamingUrl: (url) => send({ type: "CHANNEL_STREAMING_URL", channelId, url }),
              onProgress: (purpose) => {
                pct = Math.min(45, pct + 1);
                send({ type: "LOG", level: "info", message: `${channelId.toUpperCase()}: ${purpose}`, ts: ts() });
                send({ type: "PROGRESS_PCT", pct });
              },
            }).then((raw) => ({ channelId, raw })),
          ),
        );

        // For each completed session, fetch its step list once and pick the last
        // step id — that's the page state we'll attach as snapshot evidence to
        // every finding the agent produced.
        const verifiedLastStep: Record<string, string | undefined> = {};
        await Promise.all(
          Object.entries(verifiedRuns).map(async ([channelId, rid]) => {
            if (!rid) return;
            activeTinyfishRuns.delete(rid);
            const steps = await getRunSteps(rid);
            if (steps.length) verifiedLastStep[channelId] = steps[steps.length - 1].id;
          }),
        );

        // Collect findings from each successful session. Force the agency tag
        // so it always matches the channel that produced it (the agent may
        // tag inconsistently otherwise).
        const findings: Finding[] = [];
        const summaryParts: string[] = [];
        const channelDisplayName: Record<string, string> = {
          moh: "MOH", nea: "NEA", who: "WHO", cdc: "CDC", healthhub: "HealthHub",
        };
        const verifiedItemCount: Record<string, number> = {};
        const verifiedStatus: Record<string, "ok" | "failed"> = {};
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
            tinyfishRunId: verifiedRuns[channelId],
            tinyfishStepId: verifiedLastStep[channelId],
          }));
          findings.push(...channelFindings);
          verifiedItemCount[channelId] = channelFindings.length;
          verifiedStatus[channelId] = "ok";
          if (parsed.advisory_summary) summaryParts.push(parsed.advisory_summary);
          send({ type: "LOG", level: "ok", message: `${agencyTag}: ${channelFindings.length} finding${channelFindings.length === 1 ? "" : "s"}`, ts: ts() });
          // Also surface the channel's site as a consulted-source chip.
          send({ type: "SOURCE", source: { name: agencyTag, url: `https://www.${channelId === "healthhub" ? "healthhub.sg" : channelId === "who" ? "who.int" : channelId === "cdc" ? "cdc.gov" : channelId + ".gov.sg"}` } });
        }
        // Persist per-channel session metadata (one row per source).
        for (const { channelId, cfg } of verifiedTasks) {
          persist(() => saveChannelSession({
            runId,
            channelId,
            lane: "verified",
            tinyfishRunId: verifiedRuns[channelId] ?? null,
            lastStepId: verifiedLastStep[channelId] ?? null,
            startUrl: cfg.startUrl(topic.topic),
            goal: cfg.goal(topic.topic),
            status: verifiedStatus[channelId] ?? "failed",
            itemCount: verifiedItemCount[channelId] ?? 0,
            completedAt: new Date().toISOString(),
          }));
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

        const onlineRuns: Record<string, string | undefined> = {};
        const onlineResults = await Promise.allSettled(
          onlineTasks.map(({ channelId, cfg }) =>
            runAgent({
              url: cfg.startUrl(topic.topic),
              goal: cfg.goal(topic.topic),
              outputSchema: cfg.outputSchema as Record<string, unknown>,
              onStarted: (rid) => { onlineRuns[channelId] = rid; activeTinyfishRuns.add(rid); },
              onStreamingUrl: (url) => send({ type: "CHANNEL_STREAMING_URL", channelId, url }),
              onProgress: (purpose) => {
                pct = Math.min(75, pct + 1);
                send({ type: "LOG", level: "warn", message: `${channelId.toUpperCase()}: ${purpose}`, ts: ts() });
                send({ type: "PROGRESS_PCT", pct });
              },
            }).then((raw) => ({ channelId, raw })),
          ),
        );

        // Last-step lookup per online channel (drives the snapshot button).
        const onlineLastStep: Record<string, string | undefined> = {};
        await Promise.all(
          Object.entries(onlineRuns).map(async ([channelId, rid]) => {
            if (!rid) return;
            activeTinyfishRuns.delete(rid);
            const steps = await getRunSteps(rid);
            if (steps.length) onlineLastStep[channelId] = steps[steps.length - 1].id;
          }),
        );

        // Pool claims from each successful session, tagging with channel + provenance.
        type RawClaimWithProvenance = RawClaim & { tinyfishRunId?: string; tinyfishStepId?: string };
        const rawClaims: RawClaimWithProvenance[] = [];
        const onlineItemCount: Record<string, number> = {};
        const onlineStatus: Record<string, "ok" | "failed"> = {};
        for (const r of onlineResults) {
          if (r.status !== "fulfilled") {
            send({ type: "LOG", level: "warn", message: `Online-source agent failed: ${r.reason}`, ts: ts() });
            continue;
          }
          const { channelId, raw } = r.value;
          const parsed = coerceResult<{ claims?: RawClaim[] }>(raw) ?? {};
          const channelTag = onlineDisplay[channelId] ?? channelId;
          const channelClaims: RawClaimWithProvenance[] = (parsed.claims ?? []).map((c) => ({
            ...c,
            where: c.where || channelTag,
            tinyfishRunId: onlineRuns[channelId],
            tinyfishStepId: onlineLastStep[channelId],
          }));
          rawClaims.push(...channelClaims);
          onlineItemCount[channelId] = channelClaims.length;
          onlineStatus[channelId] = "ok";
          send({ type: "LOG", level: "ok", message: `${channelTag}: ${channelClaims.length} claim${channelClaims.length === 1 ? "" : "s"} surfaced`, ts: ts() });
        }
        // Persist per-channel session metadata for the online lane.
        for (const { channelId, cfg } of onlineTasks) {
          persist(() => saveChannelSession({
            runId,
            channelId,
            lane: "online",
            tinyfishRunId: onlineRuns[channelId] ?? null,
            lastStepId: onlineLastStep[channelId] ?? null,
            startUrl: cfg.startUrl(topic.topic),
            goal: cfg.goal(topic.topic),
            status: onlineStatus[channelId] ?? "failed",
            itemCount: onlineItemCount[channelId] ?? 0,
            completedAt: new Date().toISOString(),
          }));
        }
        const spread = await spreadPromise;

        // Map by claim text so we can re-attach the TinyFish provenance to each signal.
        const provenanceByText = new Map<string, { tinyfishRunId?: string; tinyfishStepId?: string }>(
          rawClaims.map((c) => [c.text, { tinyfishRunId: c.tinyfishRunId, tinyfishStepId: c.tinyfishStepId }]),
        );

        // STORE ALL scraped signals as the online sources — no upfront misinfo
        // filtering. Every scraped item becomes a CLAIM event → persisted + shown
        // under its channel tile. Misinformation is identified later, during
        // broadcast-content generation.
        send({ type: "LOG", level: "info", message: `Storing ${rawClaims.length} online signals across sources…`, ts: ts() });
        const emitted: Claim[] = [];
        let idx = 0;
        for (const c of rawClaims) {
          const prov = provenanceByText.get(c.text) ?? {};
          const claim: Claim = {
            id: `claim_${idx++}`,
            text: c.text,
            severity: "UNVERIFIED", // unverified online mention; misinfo is judged at broadcast generation
            where: c.where,
            shares: c.shares,
            velocity: spread?.velocityLabel,
            tinyfishRunId: prov.tinyfishRunId,
            tinyfishStepId: prov.tinyfishStepId,
          };
          emitted.push(claim);
          send({ type: "CLAIM", claim });
        }
        send({ type: "LOG", level: "ok", message: `Stored ${emitted.length} signals across ${new Set(emitted.map((c) => c.where)).size} sources.`, ts: ts() });

        pct = 80;
        send({ type: "PROGRESS_PCT", pct });

        // ─── Misinformation for online sources + the broadcast ───────────────
        // Find misinformation from the live scrape, AND always augment with
        // OpenAI-recalled prominent misinformation tied to these platforms. The
        // OpenAI claims are stored in the SAME Claim format so they appear under the
        // online source tiles alongside the scraped signals, and they feed the
        // broadcast assessment + draft.
        send({ type: "LOG", level: "info", message: "Scanning signals + recalling prominent platform misinformation via OpenAI…", ts: ts() });
        const scrapedMisinfo = await classifyClaims(rawClaims, findings, advisorySummary);
        const aiMisinfo = await generateFallbackClaims(topic, advisorySummary, findings, Object.values(onlineDisplay));
        // Store the OpenAI misinformation as claims too — shown in online sources.
        for (const m of aiMisinfo) {
          const claim: Claim = { ...m, id: `claim_${idx++}`, velocity: spread?.velocityLabel };
          emitted.push(claim);
          send({ type: "CLAIM", claim });
        }
        // Combined, de-duplicated misinformation set for the broadcast.
        const seenMisinfo = new Set<string>();
        const misinfo = [...scrapedMisinfo, ...aiMisinfo].filter((m) => {
          const k = m.text.trim().toLowerCase();
          if (seenMisinfo.has(k)) return false;
          seenMisinfo.add(k);
          return true;
        });
        send({
          type: "LOG",
          level: misinfo.length ? "ok" : "warn",
          message: misinfo.length
            ? `${misinfo.length} misinformation claim${misinfo.length === 1 ? "" : "s"} for the broadcast (${scrapedMisinfo.length} scraped + ${aiMisinfo.length} via OpenAI).`
            : "No misinformation identified for the broadcast.",
          ts: ts(),
        });

        pct = 82;
        send({ type: "PROGRESS_PCT", pct });

        /* ─── Broadcast assessment — the decision spine ──────────────────── */
        send({ type: "LOG", level: "info", message: "Weighing local relevance, spread and misinformation…", ts: ts() });
        const assessment = await generateAssessment(topic, advisorySummary, findings, spread, misinfo);
        send({ type: "ASSESSMENT", assessment });
        send({ type: "LOG", level: "ok", message: `Assessment: ${assessment.verdict} — ${assessment.rationale}`, ts: ts() });

        /* ─── PHASE 3: DRAFT caregiver-facing advisory ───────────────────── */
        send({ type: "PHASE", phase: "draft", label: "Drafting advisory" });
        send({ type: "LOG", level: "info", message: `Drafting for ${assessment.audience}…`, ts: ts() });

        const draft = await generateDraft({ ...topic, audience: assessment.audience }, advisorySummary, findings, misinfo, hazardSnapshot);
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
