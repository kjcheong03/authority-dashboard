/* ───────────────────────────────────────────────────────────────────────────
 * Supabase server-side client + persistence helpers.
 *
 * - Uses the SERVICE_ROLE key (server only — never imported into client code).
 * - Each helper is fire-and-forget by default: if persistence fails, it logs
 *   and continues, so a flaky DB never breaks the live research stream.
 * - All schema lives in db/schema.sql.
 * ─────────────────────────────────────────────────────────────────────────── */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Finding,
  Claim,
  Spread,
  Assessment,
  Draft,
  SourceRef,
  ClaimOrigin,
  FactCheck,
  Phase,
} from "./types";

// SupabaseClient<any> = no generated Database types; everything is loose-typed.
// Fine for a hackathon — schema is enforced server-side by Postgres anyway.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any, "public", any>;

let cached: DB | null = null;

export function db(): DB | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Persistence is optional — the app still works without DB.
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cached = createClient<any>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  }) as DB;
  return cached;
}

// Supabase query builders are PromiseLike, not Promise. Accept both.
const safe = async <T>(p: PromiseLike<T>): Promise<T | null> => {
  try { return await p; } catch (e) { console.warn("[db]", e); return null; }
};

/* ─── Run lifecycle ───────────────────────────────────────────────────────── */

export interface NewRun {
  topic: string;
  region: string;
  audience: string;
  mode: "live" | "replay";
}

export async function createRun(input: NewRun): Promise<string | null> {
  const c = db();
  if (!c) return null;
  const res = await safe(
    c.from("runs").insert({
      topic: input.topic,
      region: input.region,
      audience: input.audience,
      mode: input.mode,
      status: "running",
      phase: "ingest",
      pct: 0,
    }).select("id").single(),
  );
  return res?.data?.id ?? null;
}

export async function updateRun(runId: string | null, patch: Partial<{
  status: "running" | "complete" | "failed" | "stopped";
  phase: Phase;
  pct: number;
  error: string;
  streaming_url: string;
  completed_at: string;
}>): Promise<void> {
  if (!runId) return;
  const c = db();
  if (!c) return;
  await safe(c.from("runs").update(patch).eq("id", runId));
}

export async function markRunDone(runId: string | null, status: "complete" | "failed" | "stopped" = "complete", error?: string): Promise<void> {
  if (!runId) return;
  await updateRun(runId, { status, completed_at: new Date().toISOString(), ...(error ? { error } : {}) });
}

/* ─── Per-event saves ─────────────────────────────────────────────────────── */

export async function saveFinding(runId: string | null, f: Finding, ordinal: number) {
  if (!runId) return;
  const c = db();
  if (!c) return;
  await safe(c.from("findings").insert({
    run_id: runId,
    agency: f.agency,
    stat: f.stat ?? null,
    text: f.text,
    url: f.url ?? null,
    time_ago: f.timeAgo ?? null,
    ordinal,
  }));
}

/** Returns the DB id of the inserted claim (so origin/factchecks can FK to it). */
export async function saveClaim(runId: string | null, c: Claim, ordinal: number): Promise<string | null> {
  if (!runId) return null;
  const sb = db();
  if (!sb) return null;
  const res = await safe(sb.from("claims").insert({
    run_id: runId,
    client_id: c.id,
    text: c.text,
    severity: c.severity,
    where_seen: c.where ?? null,
    shares: c.shares ?? null,
    contradicts: c.contradicts ?? null,
    analysis: c.analysis ?? null,
    fix: c.fix ?? null,
    velocity: c.velocity ?? null,
    ordinal,
  }).select("id").single());
  return res?.data?.id ?? null;
}

export async function saveClaimOrigin(runId: string | null, clientClaimId: string, origin: ClaimOrigin) {
  if (!runId) return;
  const sb = db();
  if (!sb) return;
  // Look up the claim's DB id by run_id + client_id.
  const { data: row } = await sb.from("claims").select("id").eq("run_id", runId).eq("client_id", clientClaimId).maybeSingle();
  const claimId = row?.id;
  if (!claimId) return;
  const rows = (origin.timeline ?? []).map((e, i) => ({
    claim_id: claimId,
    single_source: origin.singleSource ?? null,
    date_str: e.date ?? null,
    outlet: e.outlet,
    event: e.event,
    type: e.type,
    url: e.url ?? null,
    ordinal: i,
  }));
  if (rows.length) await safe(sb.from("claim_origins").insert(rows));
}

export async function saveClaimFactchecks(runId: string | null, clientClaimId: string, factChecks: FactCheck[]) {
  if (!runId || !factChecks.length) return;
  const sb = db();
  if (!sb) return;
  const { data: row } = await sb.from("claims").select("id").eq("run_id", runId).eq("client_id", clientClaimId).maybeSingle();
  const claimId = row?.id;
  if (!claimId) return;
  await safe(sb.from("claim_factchecks").insert(
    factChecks.map((f) => ({ claim_id: claimId, publisher: f.publisher, rating: f.rating, title: f.title ?? null, url: f.url })),
  ));
}

export async function saveSpread(runId: string | null, s: Spread) {
  if (!runId) return;
  const sb = db();
  if (!sb) return;
  await safe(sb.from("spread").upsert({
    run_id: runId,
    velocity_label: s.velocityLabel,
    total_articles: s.totalArticles,
    top_countries: s.topCountries ?? [],
    singapore_articles: s.singaporeArticles,
    singapore_velocity: s.singaporeVelocity,
    tone_label: s.toneLabel ?? null,
    avg_tone: s.avgTone ?? null,
    source: s.source ?? null,
    timeline: s.timeline ?? [],
  }));
}

export async function saveAssessment(runId: string | null, a: Assessment) {
  if (!runId) return;
  const sb = db();
  if (!sb) return;
  await safe(sb.from("assessments").upsert({
    run_id: runId,
    verdict: a.verdict,
    rationale: a.rationale,
    urgency: a.urgency,
    audience: a.audience,
    signal_local: a.signals.local,
    signal_spread: a.signals.spread,
    signal_misinfo: a.signals.misinfo,
  }));
}

export async function saveDraft(runId: string | null, d: Draft) {
  if (!runId) return;
  const sb = db();
  if (!sb) return;
  await safe(sb.from("drafts").upsert({
    run_id: runId,
    title: d.title,
    body: d.body,
    target: d.target,
    urgency: d.urgency,
    checklist: d.checklist ?? [],
  }));
}

export async function saveSource(runId: string | null, src: SourceRef, ordinal: number) {
  if (!runId) return;
  const sb = db();
  if (!sb) return;
  await safe(sb.from("sources").insert({ run_id: runId, name: src.name, url: src.url, ordinal }));
}

export async function saveLog(runId: string | null, level: "info" | "warn" | "ok", message: string, ts?: string) {
  if (!runId) return;
  const sb = db();
  if (!sb) return;
  await safe(sb.from("run_logs").insert({ run_id: runId, level, message, ts: ts ? new Date().toISOString() : new Date().toISOString() }));
}

/* ─── Hydration: load a saved run for autofill ────────────────────────────── */

export interface HydratedRun {
  run: {
    id: string;
    topic: string;
    region: string;
    audience: string;
    mode: "live" | "replay";
    status: string;
    phase: string | null;
    pct: number;
    created_at: string;
    completed_at: string | null;
  };
  findings: Finding[];
  claims: Claim[];
  spread: Spread | null;
  assessment: Assessment | null;
  draft: Draft | null;
  sources: SourceRef[];
}

export async function loadRun(runId: string): Promise<HydratedRun | null> {
  const sb = db();
  if (!sb) return null;

  const [runRes, findingsRes, claimsRes, spreadRes, assessRes, draftRes, sourcesRes] = await Promise.all([
    sb.from("runs").select("*").eq("id", runId).maybeSingle(),
    sb.from("findings").select("*").eq("run_id", runId).order("ordinal"),
    sb.from("claims").select("*").eq("run_id", runId).order("ordinal"),
    sb.from("spread").select("*").eq("run_id", runId).maybeSingle(),
    sb.from("assessments").select("*").eq("run_id", runId).maybeSingle(),
    sb.from("drafts").select("*").eq("run_id", runId).maybeSingle(),
    sb.from("sources").select("*").eq("run_id", runId).order("ordinal"),
  ]);

  const r = runRes.data;
  if (!r) return null;

  // For each claim, fetch its origin timeline + fact-checks.
  const claimRows = claimsRes.data ?? [];
  const claimIds = claimRows.map((c) => c.id);
  const [originsRes, fcRes] = await Promise.all([
    claimIds.length ? sb.from("claim_origins").select("*").in("claim_id", claimIds).order("ordinal") : Promise.resolve({ data: [] as Array<{ claim_id: string; date_str: string | null; outlet: string; event: string; type: ClaimOrigin["timeline"][number]["type"]; url: string | null; single_source: boolean | null }> }),
    claimIds.length ? sb.from("claim_factchecks").select("*").in("claim_id", claimIds) : Promise.resolve({ data: [] as Array<{ claim_id: string; publisher: string; rating: string; title: string | null; url: string }> }),
  ]);
  const originsByClaim = new Map<string, ClaimOrigin>();
  for (const o of (originsRes.data ?? [])) {
    const existing: ClaimOrigin = originsByClaim.get(o.claim_id) ?? { singleSource: o.single_source ?? undefined, timeline: [] };
    existing.timeline.push({
      date: o.date_str ?? undefined,
      outlet: o.outlet,
      event: o.event,
      type: o.type,
      url: o.url ?? undefined,
    });
    originsByClaim.set(o.claim_id, existing);
  }
  const fcByClaim = new Map<string, FactCheck[]>();
  for (const f of (fcRes.data ?? [])) {
    const arr = fcByClaim.get(f.claim_id) ?? [];
    arr.push({ publisher: f.publisher, rating: f.rating, title: f.title ?? "", url: f.url });
    fcByClaim.set(f.claim_id, arr);
  }

  const claims: Claim[] = claimRows.map((c) => ({
    id: c.client_id ?? `claim_${c.ordinal}`,
    text: c.text,
    severity: c.severity,
    where: c.where_seen ?? undefined,
    shares: c.shares ?? undefined,
    contradicts: c.contradicts ?? undefined,
    analysis: c.analysis ?? undefined,
    fix: c.fix ?? undefined,
    velocity: c.velocity ?? undefined,
    origin: originsByClaim.get(c.id),
    factChecks: fcByClaim.get(c.id),
  }));

  const findings: Finding[] = (findingsRes.data ?? []).map((f) => ({
    agency: f.agency,
    stat: f.stat ?? undefined,
    text: f.text,
    url: f.url ?? undefined,
    timeAgo: f.time_ago ?? undefined,
  }));

  const sp = spreadRes.data;
  const spread: Spread | null = sp
    ? {
        velocityLabel: sp.velocity_label,
        totalArticles: sp.total_articles ?? 0,
        topCountries: sp.top_countries ?? [],
        singaporeArticles: sp.singapore_articles ?? 0,
        singaporeVelocity: sp.singapore_velocity,
        toneLabel: sp.tone_label ?? undefined,
        avgTone: sp.avg_tone ?? undefined,
        source: sp.source ?? undefined,
        timeline: sp.timeline ?? undefined,
      }
    : null;

  const a = assessRes.data;
  const assessment: Assessment | null = a
    ? {
        verdict: a.verdict,
        rationale: a.rationale,
        urgency: a.urgency,
        audience: a.audience,
        signals: { local: a.signal_local ?? "—", spread: a.signal_spread ?? "—", misinfo: a.signal_misinfo ?? "—" },
      }
    : null;

  const d = draftRes.data;
  const draft: Draft | null = d
    ? { title: d.title, body: d.body, target: d.target, urgency: d.urgency, checklist: d.checklist ?? [] }
    : null;

  const sources: SourceRef[] = (sourcesRes.data ?? []).map((s) => ({ name: s.name, url: s.url }));

  return {
    run: {
      id: r.id,
      topic: r.topic,
      region: r.region,
      audience: r.audience,
      mode: r.mode,
      status: r.status,
      phase: r.phase,
      pct: r.pct,
      created_at: r.created_at,
      completed_at: r.completed_at,
    },
    findings,
    claims,
    spread,
    assessment,
    draft,
    sources,
  };
}

/* ─── List recent runs (for the "Recent runs" picker) ─────────────────────── */

export interface RunListItem {
  id: string;
  topic: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  verdict: string | null;
}

export async function listRecentRuns(limit = 12): Promise<RunListItem[]> {
  const sb = db();
  if (!sb) return [];
  const { data } = await sb
    .from("runs")
    .select("id, topic, status, created_at, completed_at, assessments(verdict)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: { id: string; topic: string; status: string; created_at: string; completed_at: string | null; assessments?: { verdict: string }[] | { verdict: string } | null }) => {
    const a = Array.isArray(r.assessments) ? r.assessments[0] : r.assessments;
    return {
      id: r.id,
      topic: r.topic,
      status: r.status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      verdict: a?.verdict ?? null,
    };
  });
}

/* ─── Broadcast ───────────────────────────────────────────────────────────── */

export interface NewBroadcast {
  runId: string;
  title: string;
  body: string;
  urgency: "HIGH" | "NORMAL";
  audienceMode: "all" | "selected";
  targetProfiles: string[];
  reachEstimate?: number;
}

function genConfirmationId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BCST-${ymd}-${rand}`;
}

export async function saveBroadcast(b: NewBroadcast): Promise<{ id: string; confirmationId: string } | null> {
  const sb = db();
  if (!sb) return null;
  const confirmationId = genConfirmationId();
  const reach = b.reachEstimate ?? estimateReach(b.audienceMode, b.targetProfiles);
  const res = await safe(sb.from("broadcasts").insert({
    run_id: b.runId,
    draft_snapshot: { title: b.title, body: b.body, urgency: b.urgency },
    title: b.title,
    body: b.body,
    urgency: b.urgency,
    audience_mode: b.audienceMode,
    target_profiles: b.targetProfiles,
    reach_estimate: reach,
    confirmation_id: confirmationId,
    status: "sent",
  }).select("id").single());
  return res?.data?.id ? { id: res.data.id, confirmationId } : null;
}

function estimateReach(mode: "all" | "selected", profiles: string[]): number {
  if (mode === "all") return 380_000;
  if (!profiles.length) return 380_000;
  // Rough per-profile share of the elderly-caregiver population, just for demo.
  const perProfile: Record<string, number> = {
    Diabetes: 92_000, Heart: 78_000, Respiratory: 64_000, Dementia: 41_000,
    Kidney: 28_000, Immunocompromised: 22_000, Mobility: 55_000,
  };
  return profiles.reduce((s, p) => s + (perProfile[p] ?? 30_000), 0);
}

/* ─── Hazard GDELT cache ──────────────────────────────────────────────────
 * Per-topic GDELT spread cached in Supabase so the top hazard cards load
 * instantly. Refresh button on each card forces a re-fetch via the
 * /api/hazards/gdelt endpoint with ?refresh=1.
 * ────────────────────────────────────────────────────────────────────────── */

export interface HazardGdeltRow {
  spread: Spread;
  fetched_at: string;
}

// Cache key includes an optional historical date so each (topic, date) window
// stays cached independently. "current" data uses just the topic; historical
// COVID date picks use "<topic>@<YYYY-MM-DD>".
function gdeltKey(topic: string, date?: string): string {
  const t = topic.trim().toLowerCase();
  return date ? `${t}@${date}` : t;
}

export async function getCachedGdelt(topic: string, date?: string): Promise<HazardGdeltRow | null> {
  const sb = db();
  if (!sb) return null;
  const { data } = await sb.from("hazard_gdelt").select("spread, fetched_at").eq("topic", gdeltKey(topic, date)).maybeSingle();
  if (!data) return null;
  return { spread: data.spread as Spread, fetched_at: data.fetched_at as string };
}

export async function setCachedGdelt(topic: string, spread: Spread, date?: string): Promise<void> {
  const sb = db();
  if (!sb) return;
  await safe(sb.from("hazard_gdelt").upsert({ topic: gdeltKey(topic, date), spread, fetched_at: new Date().toISOString() }));
}

export async function listBroadcasts(limit = 20) {
  const sb = db();
  if (!sb) return [];
  const { data } = await sb
    .from("broadcasts")
    .select("id, run_id, title, urgency, audience_mode, reach_estimate, confirmation_id, sent_at, runs(topic)")
    .order("sent_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
