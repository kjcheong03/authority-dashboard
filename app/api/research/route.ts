import { NextRequest } from "next/server";
import type { ServerEvent, Claim, Finding, TopicInput } from "@/lib/types";
import { getSpread } from "@/lib/spread";
import { fetchDengueClusters } from "@/lib/datagovsg";
import {
  classifyClaims,
  generateAssessment,
  generateDraft,
  generateFallbackClaims,
  type RawClaim,
} from "@/lib/agents";
import { runChannel, CHANNELS } from "@/lib/scrapers";
import type { ScrapedItem } from "@/lib/scrapers/types";
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
  saveDraftHistory,
  saveSource,
  saveLog,
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

  // Serialise DB writes so CLAIM lands before any later references.
  let persistChain: Promise<void> = Promise.resolve();
  const persist = (fn: () => Promise<void>) => {
    persistChain = persistChain.then(fn).catch((e) => console.warn("[db]", e));
  };

  const stream = new ReadableStream({
    async start(controller) {
      // The client's AbortController fires this on Stop. We mark the run stopped
      // and short-circuit.
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
        /* ─── PHASE 1: INGEST — verified-source scrapers in parallel ─────── */
        send({ type: "PHASE", phase: "ingest", label: "High-priority ingest" });

        let pct = 5;
        send({ type: "PROGRESS_PCT", pct });

        // data.gov.sg ground-truth (NEA dengue clusters) — supplementary enrichment
        // that runs alongside the per-source scrapers.
        const isDengue = /dengue/i.test(topic.topic);
        const clustersPromise = isDengue ? fetchDengueClusters() : Promise.resolve(null);

        // Fire all verified-source scrapers IN PARALLEL.
        // Promise.allSettled so one stalled site doesn't kill the whole phase.
        const verifiedChannels = CHANNELS.filter((c) => c.lane === "verified");
        send({ type: "LOG", level: "info", message: "Scanning " + verifiedChannels.length + " verified sources in parallel…", ts: ts() });
        const verifiedResults = await Promise.allSettled(
          verifiedChannels.map((ch) =>
            runChannel(ch.id, topic.topic, {
              onLog: (msg) => send({ type: "LOG", level: "info", message: ch.id.toUpperCase() + ": " + msg, ts: ts() }),
            }).then((r) => ({ ch, result: r })),
          ),
        );

        const findings: Finding[] = [];
        const summaryParts: string[] = [];
        for (const r of verifiedResults) {
          if (r.status !== "fulfilled") {
            send({ type: "LOG", level: "warn", message: "Verified-source scraper failed: " + r.reason, ts: ts() });
            continue;
          }
          const { ch, result } = r.value;
          const channelFindings: Finding[] = result.items.map((it: ScrapedItem) => ({
            agency: ch.displayName,
            stat: it.stat,
            text: it.text,
            url: it.url,
            sourceUrl: it.url,
            timeAgo: it.timeAgo,
          }));
          for (const f of channelFindings) {
            ord.finding++;
            findings.push(f);
            send({ type: "FINDING", finding: f });
            persist(() => saveFinding(runId, f, ord.finding));
          }
          send({ type: "SOURCE", source: { name: ch.displayName, url: "https://www." + (ch.id === "who" ? "who.int" : ch.id === "cdc" ? "cdc.gov" : ch.id === "healthhub" ? "healthhub.sg" : ch.id + ".gov.sg") } });
          send({ type: "LOG", level: "ok", message: ch.displayName + ": " + channelFindings.length + " findings", ts: ts() });
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
          const headFinding: Finding = {
            agency: "NEA",
            stat: `${clusters.totalClusters} clusters`,
            text: `${clusters.totalClusters} active dengue clusters in Singapore (${clusters.totalCases} cases total)${clusters.largest ? `; largest at ${clusters.largest.locality} with ${clusters.largest.cases} cases` : ""}.`,
            url: "https://www.nea.gov.sg/dengue-zika/dengue/dengue-clusters",
            timeAgo: clusters.updated ? `as of ${clusters.updated}` : "live",
          };
          findings.unshift(headFinding);
          ord.finding++;
          send({ type: "FINDING", finding: headFinding });
          persist(() => saveFinding(runId, headFinding, ord.finding));
          if (clusters.habitats.length) {
            const habitatFinding: Finding = {
              agency: "NEA",
              stat: "breeding habitats",
              text: `Common breeding habitats in active clusters: ${clusters.habitats.join(", ")}.`,
              url: "https://www.nea.gov.sg/dengue-zika/dengue/dengue-clusters",
              timeAgo: clusters.updated ? `as of ${clusters.updated}` : "live",
            };
            findings.push(habitatFinding);
            ord.finding++;
            send({ type: "FINDING", finding: habitatFinding });
            persist(() => saveFinding(runId, habitatFinding, ord.finding));
          }
        }

        send({ type: "LOG", level: "ok", message: `Extracted ${findings.length} verified findings`, ts: ts() });
        pct = 50;
        send({ type: "PROGRESS_PCT", pct });

        /* ─── PHASE 2: MISINFO — online-source scrapers in parallel ─────── */
        send({ type: "PHASE", phase: "misinfo", label: "Cross-referencing public claims" });

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

        // Fire all online-channel scrapers IN PARALLEL.
        const onlineChannels = CHANNELS.filter((c) => c.lane === "online");
        send({ type: "LOG", level: "info", message: "Scanning " + onlineChannels.length + " online sources in parallel…", ts: ts() });
        const onlineResults = await Promise.allSettled(
          onlineChannels.map((ch) =>
            runChannel(ch.id, topic.topic, {
              onLog: (msg) => send({ type: "LOG", level: "warn", message: ch.id.toUpperCase() + ": " + msg, ts: ts() }),
            }).then((r) => ({ ch, result: r })),
          ),
        );

        type RawClaimWithProvenance = RawClaim & { sourceUrl?: string };
        const rawClaims: RawClaimWithProvenance[] = [];
        for (const r of onlineResults) {
          if (r.status !== "fulfilled") {
            send({ type: "LOG", level: "warn", message: "Online-source scraper failed: " + r.reason, ts: ts() });
            continue;
          }
          const { ch, result } = r.value;
          const channelClaims: RawClaimWithProvenance[] = result.items.map((it: ScrapedItem) => ({
            text: it.text,
            where: ch.displayName,
            shares: it.shares,
            sourceUrl: it.url,
          }));
          rawClaims.push(...channelClaims);
          send({ type: "LOG", level: "ok", message: ch.displayName + ": " + channelClaims.length + " claims surfaced", ts: ts() });
        }
        const spread = await spreadPromise;

        // Map by claim text so we can re-attach provenance to each signal.
        const provenanceByText = new Map<string, { sourceUrl?: string }>(
          rawClaims.map((c) => [c.text, { sourceUrl: c.sourceUrl }]),
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
            sourceUrl: prov.sourceUrl,
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
        const onlineDisplayNames = onlineChannels.map((c) => c.displayName);
        const aiMisinfo = await generateFallbackClaims(topic, advisorySummary, findings, onlineDisplayNames);
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
        await saveDraft(runId, draft);
        await saveDraftHistory({
          runId,
          title: draft.title,
          body: draft.body,
          target: draft.target,
          urgency: draft.urgency,
          audienceMode: "all",
          profiles: [],
        });

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
