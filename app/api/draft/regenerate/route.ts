/* ───────────────────────────────────────────────────────────────────────────
 * POST /api/draft/regenerate
 *
 * Reuses the existing findings + claims stored for a run and regenerates the
 * broadcast draft from only the subset of sources the officer ticked in the
 * SourcePickerModal. No re-running of TinyFish/agents — pure OpenAI draft pass.
 *
 * Body: { runId, officialChannels: string[], socialChannels: string[] }
 * ─────────────────────────────────────────────────────────────────────────── */

import { db, loadRun, saveDraft, saveLog, updateRun } from "@/lib/db";
import { generateDraft } from "@/lib/agents";
import { channelForAgency, channelForWhere } from "@/lib/channels";
import type { Finding, Claim, TopicInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // give OpenAI room before Hobby's 10s default 504s

interface PostBody {
  runId: string;
  officialChannels: string[];
  socialChannels: string[];
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<PostBody>;
  if (!body.runId) return new Response("Missing runId", { status: 400 });

  const sb = db();
  if (!sb) return new Response("Database not configured", { status: 503 });

  const hydrated = await loadRun(body.runId);
  if (!hydrated) return new Response("Run not found", { status: 404 });

  const officialSet = new Set(body.officialChannels ?? []);
  const socialSet = new Set(body.socialChannels ?? []);

  // Filter findings by which official channels are selected.
  const findings: Finding[] = hydrated.findings.filter((f) => {
    const ch = channelForAgency(f.agency);
    return ch ? officialSet.has(ch.id) : false;
  });

  // Filter claims by which online channels are selected.
  const claims: Claim[] = hydrated.claims.filter((c) => {
    const ch = channelForWhere(c.where);
    return ch ? socialSet.has(ch.id) : false;
  });

  const topic: TopicInput = {
    topic: hydrated.run.topic,
    region: hydrated.run.region,
    audience: hydrated.run.audience,
  };

  // Build a quick advisory summary from the selected findings — gives the
  // draft prompt something to ground on without re-running ingest.
  const advisorySummary = findings.length
    ? findings.map((f) => `${f.agency}: ${f.text}`).join(" ")
    : "No verified guidance selected.";

  await saveLog(body.runId, "info", `Regenerating draft from ${officialSet.size} verified + ${socialSet.size} online source(s) selected by officer…`);

  try {
    const draft = await generateDraft(
      topic,
      advisorySummary,
      findings,
      claims.map((c) => ({
        text: c.text,
        severity: c.severity,
        where: c.where,
        shares: c.shares,
        contradicts: c.contradicts,
        analysis: c.analysis,
        fix: c.fix,
        velocity: c.velocity,
      })),
    );
    // Keep urgency consistent with the original assessment if there is one.
    if (hydrated.assessment) draft.urgency = hydrated.assessment.urgency;

    await saveDraft(body.runId, draft);
    await updateRun(body.runId, { pct: 100 });
    await saveLog(body.runId, "ok", `Draft regenerated · ${findings.length} facts · ${claims.length} claims.`);

    return Response.json({
      draft,
      stats: { facts: findings.length, claims: claims.length },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Draft regeneration failed";
    await saveLog(body.runId, "warn", `Regenerate failed: ${msg}`);
    return new Response(msg, { status: 500 });
  }
}
