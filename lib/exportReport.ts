/* ───────────────────────────────────────────────────────────────────────────
 * Exportable advisory report — self-contained HTML opened in a new tab with a
 * "Save as PDF" button (window.print).
 *
 * Style mirrors the dashboard: Inter sans-serif, navy header, white
 * rounded cards, minimalist.
 * ─────────────────────────────────────────────────────────────────────────── */

import type { TopicInput, Finding, Claim, Draft, Spread, ClaimOrigin, FactCheck, SourceRef, Assessment } from "./types";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

// Like esc(), but also renders **bold** markers and [text](url) links (used for the advisory body).
const escRich = (s: string) =>
  esc(s)
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

const FOREST = "#002C77"; // brand deep navy (Singapore government blue)
const INK = "#0f2747";
const DANGER = "#dc2626";
const AMBER = "#b45309";
const AGENCY: Record<string, string> = { MOH: "#1d4ed8", NEA: "#0fae8e", WHO: "#6d28d9", CDC: "#b45309", HealthHub: "#0fae8e", HSA: "#1d4ed8" };
const VEL: Record<string, string> = {
  SURGING: DANGER, RISING: AMBER, STEADY: "#1d4ed8", DECLINING: "#16a34a", MINIMAL: "#94a3b8",
  ALARMIST: DANGER, NEGATIVE: AMBER, NEUTRAL: "#1d4ed8", POSITIVE: "#16a34a",
};
const EVENT_COL: Record<string, string> = { origin: DANGER, amplification: AMBER, investigation: "#1d4ed8", debunk: "#16a34a" };
const VERDICT_COL: Record<string, string> = { BROADCAST: "#1d4ed8", MONITOR: AMBER, "NO ACTION": "#16a34a" };

const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`);
const fmtDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${+day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1] ?? ""}`;
};

/* ─── sparklines ──────────────────────────────────────────────────────────── */
function sparkBars(vals: number[], color: string, w = 150, h = 30): string {
  if (vals.length < 2) return "";
  const max = Math.max(...vals, 1);
  const bw = w / vals.length;
  const bars = vals
    .map((v, i) => {
      const bh = Math.max(1.5, (v / max) * (h - 3));
      return `<rect x="${(i * bw).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw * 0.62).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${color}" opacity="${i === vals.length - 1 ? 1 : 0.55}"/>`;
    })
    .join("");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin-top:8px;width:100%">${bars}</svg>`;
}
function sparkLine(vals: number[], color: string, w = 150, h = 30): string {
  if (vals.length < 2) return "";
  const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / rng) * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;margin-top:8px;width:100%"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
}

/* ─── sections ────────────────────────────────────────────────────────────── */
function assessmentHTML(a: Assessment | undefined): string {
  if (!a) return "";
  const col = VERDICT_COL[a.verdict] ?? "#1d4ed8";
  const sig = (l: string, v: string) => `<span class="chip"><b>${l}</b> · ${esc(v)}</span>`;
  return `
  <div class="card assess" style="border-left:4px solid ${col}">
    <div class="assess-row">
      <div>
        <div class="eyebrow">Recommendation</div>
        <div class="verdict" style="color:${col}">${esc(a.verdict)}</div>
        <p class="assess-why">${esc(a.rationale)}</p>
      </div>
      <div class="assess-meta">Urgency <b>${esc(a.urgency)}</b><br>${esc(a.audience)}</div>
    </div>
    <div class="chips">${sig("Local", a.signals.local)}${sig("Spread", a.signals.spread)}${sig("Misinfo", a.signals.misinfo)}</div>
  </div>`;
}

function findingsHTML(findings: Finding[]): string {
  if (!findings.length) return `<p class="empty">No verified facts.</p>`;
  return findings
    .map((f) => {
      const col = AGENCY[f.agency] ?? "#475569";
      return `
      <div class="finding">
        <span class="badge" style="background:${col}">${esc(f.agency)}</span>
        <div>
          <div class="finding-text">${esc(f.text)}</div>
          <div class="finding-meta">${f.stat ? `<b style="color:${col}">${esc(f.stat)}</b>` : ""}${f.stat && f.url ? "  ·  " : ""}${f.url ? `<a href="${f.url}">${esc(f.url.replace(/^https?:\/\//, "").slice(0, 52))}</a>` : ""}</div>
        </div>
      </div>`;
    })
    .join("");
}

function spreadHTML(s: Spread | null): string {
  if (!s) return `<p class="empty">Coverage signal unavailable for this run.</p>`;
  const tl = s.timeline ?? [];
  const range = tl.length ? `${fmtDate(tl[0].date)}–${fmtDate(tl[tl.length - 1].date)}` : "";
  const peak = (vals: number[]) => (vals.length ? fmtNum(Math.max(...vals)) : "");
  const tile = (label: string, value: string, sub: string, chart: string) => `
    <div class="tile">
      <div class="tile-label">${label}</div>
      <div class="tile-val" style="color:${VEL[value] ?? "#777"}">${esc(value)}</div>
      ${chart}
      <div class="tile-axis"><span>${range}</span><span>${sub}</span></div>
    </div>`;
  return `
  <div class="tiles">
    ${tile("Global", s.velocityLabel, `${fmtNum(s.totalArticles)} · peak ${peak(tl.map((p) => p.global))}/d`, sparkBars(tl.map((p) => p.global), "#1d4ed8"))}
    ${tile("🇸🇬 Singapore", s.singaporeVelocity, `${fmtNum(s.singaporeArticles)} · peak ${peak(tl.map((p) => p.sg))}/d`, sparkBars(tl.map((p) => p.sg), "#16a34a"))}
    ${s.toneLabel ? tile("Media tone", s.toneLabel, typeof s.avgTone === "number" ? `avg ${s.avgTone}` : "", sparkLine(tl.filter((p) => typeof p.tone === "number").map((p) => p.tone as number), AMBER)) : ""}
  </div>
  <div class="dim" style="margin-top:8px">via GDELT${s.source === "bigquery" ? " · BigQuery" : ""} · daily, last 30 days</div>`;
}

function factChecksHTML(fcs: FactCheck[] | undefined): string {
  if (!fcs || !fcs.length) return "";
  return `<div class="fcs">${fcs
    .map((f) => `<a class="fc" href="${f.url}"><span class="fc-r">${esc(f.rating)}</span> Fact-checked · <b>${esc(f.publisher)}</b></a>`)
    .join("")}</div>`;
}

function originHTML(o: ClaimOrigin | undefined): string {
  if (!o) return "";
  const events = o.timeline
    .map((e) => {
      const col = EVENT_COL[e.type] ?? "#94a3b8";
      const outlet = e.url ? `<a href="${e.url}"><b>${esc(e.outlet)}</b></a>` : `<b>${esc(e.outlet)}</b>`;
      return `<div class="otl-row">
        <span class="otl-dot" style="background:${col}"></span>
        <div>
          <div class="otl-head"><span style="color:${col}">${esc(e.type)}</span>${e.date ? ` · ${esc(e.date)}` : ""} · ${outlet}</div>
          <div class="otl-event">${esc(e.event)}</div>
        </div>
      </div>`;
    })
    .join("");
  return `<div class="origin"><div class="eyebrow" style="color:${DANGER}">Origin trace${o.singleSource ? " · single source" : ""}</div>${o.summary ? `<p class="line">${esc(o.summary)}</p>` : ""}${events ? `<div class="otl">${events}</div>` : ""}</div>`;
}

function claimsHTML(claims: Claim[]): string {
  if (!claims.length) return `<p class="empty">No misinformation detected.</p>`;
  return claims
    .map((c) => {
      const danger = c.severity === "UNVERIFIED";
      const accent = danger ? DANGER : "#94a3b8";
      return `
      <div class="claim" style="border-left:3px solid ${accent};background:${danger ? "#fef2f2" : "#f8fafc"}">
        <div class="claim-top">
          <span class="ctag" style="background:${accent}">${danger ? "UNVERIFIED" : "MINOR DISCREPANCY"}</span>
          ${c.where ? `<span class="meta-tag">${esc(c.where)}</span>` : ""}
          ${c.shares ? `<span class="dim">${esc(c.shares)}</span>` : ""}
          ${c.velocity ? `<span class="vel" style="color:${VEL[c.velocity] ?? "#94a3b8"}">${esc(c.velocity)}</span>` : ""}
        </div>
        <p class="quote" style="color:${danger ? "#991b1b" : "#334155"}">“${esc(c.text)}”</p>
        ${c.analysis ? `<p class="line"><b>AI analysis:</b> ${esc(c.analysis)}</p>` : ""}
        ${c.contradicts ? `<p class="line"><b>Contradicts:</b> ${esc(c.contradicts)}</p>` : ""}
        ${c.fix ? `<div class="fix"><b>Suggested clarification:</b> ${esc(c.fix)}</div>` : ""}
        ${factChecksHTML(c.factChecks)}
        ${originHTML(c.origin)}
      </div>`;
    })
    .join("");
}

function sourcesHTML(sources: SourceRef[]): string {
  if (!sources.length) return "";
  return `<div class="chips">${sources.map((s) => `<a class="chip" href="${s.url}">${esc(s.name)}</a>`).join("")}</div>`;
}

/* ─── document ────────────────────────────────────────────────────────────── */
interface ReportParams {
  topic: TopicInput;
  assessment?: Assessment | null;
  draft: Draft | null;
  findings: Finding[];
  claims: Claim[];
  spread: Spread | null;
  sources?: SourceRef[];
}

function generateHTML(p: ReportParams): string {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const d = p.draft;
  const urgent = d?.urgency === "HIGH";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>ORCA Advisory — ${esc(p.topic.topic).slice(0, 60)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root { --ink:${INK}; --muted:#6b7c8c; --line:#dbe6e2; --forest:${FOREST}; }
  body { font-family: 'Inter', "Segoe UI", system-ui, -apple-system, sans-serif; font-weight: 500; color: var(--ink);
    background: #eef6f1; max-width: 820px; margin: 0 auto; padding: 0 0 40px; font-size: 13px; line-height: 1.55;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @media print { .no-print { display: none; } .card, .finding, .tile, .otl-row, .claim { page-break-inside: avoid; } }
  a { color: var(--forest); text-decoration: none; }
  .wrap { padding: 0 28px; }

  .print-btn { display: block; margin: 22px auto; padding: 11px 24px; background: var(--ink); color: #fff; border: none;
    border-radius: 999px; cursor: pointer; font: inherit; font-weight: 600; font-size: 12px; }

  /* green header bar — like the navbar */
  .nav { background: var(--forest); padding: 16px 28px; display: flex; align-items: center; gap: 10px; }
  .nav b { color: #A6C8FF; font-weight: 700; font-size: 18px; letter-spacing: 0.5px; }
  .nav span { color: rgba(166,200,255,.55); }
  .nav i { color: #fff; font-style: normal; font-weight: 600; font-size: 14px; }

  .head { padding: 24px 28px 6px; }
  .title { font-size: 26px; font-weight: 700; text-transform: capitalize; letter-spacing: -0.5px; }
  .date { font-size: 11.5px; color: var(--muted); margin-top: 4px; }

  .eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  .dim { font-size: 10.5px; color: var(--muted); }
  .empty { font-size: 13px; color: var(--muted); }

  .card { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; margin-bottom: 14px; }
  .card-h { font-size: 15px; font-weight: 700; margin-bottom: 13px; }

  /* assessment */
  .assess-row { display: flex; justify-content: space-between; gap: 16px; }
  .verdict { font-size: 23px; font-weight: 700; margin-top: 3px; letter-spacing: -0.3px; }
  .assess-why { font-size: 13px; margin-top: 7px; max-width: 460px; }
  .assess-meta { font-size: 11.5px; color: var(--muted); text-align: right; line-height: 1.7; white-space: nowrap; }
  .assess-meta b { color: var(--ink); }
  .chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 13px; }
  .chip { font-size: 11px; color: var(--ink); background: #eef6f1; border: 1px solid var(--line); border-radius: 999px; padding: 4px 11px; }
  .chip b { color: var(--muted); font-weight: 600; }

  /* findings */
  .finding { display: flex; gap: 11px; align-items: flex-start; padding: 11px 0; border-top: 1px solid #eef2f0; }
  .finding:first-child { border-top: none; }
  .badge { font-size: 9.5px; font-weight: 700; color: #fff; padding: 3px 7px; border-radius: 6px; flex-shrink: 0; margin-top: 1px; }
  .finding-text { font-size: 13px; }
  .finding-meta { font-size: 10.5px; color: var(--muted); margin-top: 4px; }
  .finding-meta a { color: var(--muted); }

  /* coverage tiles */
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .tile { border: 1px solid var(--line); border-radius: 12px; padding: 12px 13px; }
  .tile-label { font-size: 10.5px; color: var(--muted); }
  .tile-val { font-size: 17px; font-weight: 700; margin-top: 5px; }
  .tile-axis { display: flex; justify-content: space-between; font-size: 9px; color: var(--muted); margin-top: 5px; }

  /* claims */
  .claim { border-radius: 0 12px 12px 0; padding: 13px 15px; margin-bottom: 11px; }
  .claim-top { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; flex-wrap: wrap; }
  .ctag { font-size: 9px; font-weight: 700; color: #fff; padding: 2px 7px; border-radius: 5px; letter-spacing: 0.03em; }
  .meta-tag { font-size: 10px; font-weight: 600; color: #475569; background: #e2e8f0; padding: 1px 7px; border-radius: 5px; }
  .vel { font-size: 9px; font-weight: 700; margin-left: auto; letter-spacing: 0.04em; }
  .quote { font-size: 13.5px; font-style: italic; line-height: 1.5; margin-bottom: 9px; }
  .line { font-size: 11.5px; color: #475569; margin: 4px 0; line-height: 1.5; }
  .line b { color: var(--ink); font-weight: 700; }
  .fix { margin-top: 8px; padding: 8px 11px; background: #ecfdf5; border-radius: 8px; font-size: 11.5px; color: #065f46; }
  .fix b { font-weight: 700; }

  /* fact checks */
  .fcs { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
  .fc { font-size: 11px; color: #475569; }
  .fc-r { font-size: 9px; font-weight: 700; color: ${FOREST}; background: #e7f2ed; padding: 2px 7px; border-radius: 5px; }

  /* origin */
  .origin { margin-top: 12px; padding-top: 11px; border-top: 1px dashed #e2b8b8; }
  .origin .line { color: #475569; }
  .otl { margin-top: 9px; }
  .otl-row { display: flex; gap: 10px; padding-bottom: 9px; }
  .otl-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
  .otl-head { font-size: 9.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
  .otl-head b { color: var(--ink); }
  .otl-event { font-size: 11.5px; color: #475569; line-height: 1.45; }

  /* advisory */
  .urgency { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #fff;
    background: ${urgent ? DANGER : FOREST}; padding: 3px 9px; border-radius: 6px; }
  .adv-title { font-size: 16px; font-weight: 700; }
  .adv-target { font-size: 11px; color: var(--muted); margin: 4px 0 12px; }
  .adv-body { font-size: 13.5px; line-height: 1.65; }
  .adv-body a { color: ${FOREST}; text-decoration: underline; }
  .check-h { font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${FOREST}; margin: 16px 0 7px; }
  .check { padding-left: 18px; }
  .check li { margin-bottom: 5px; font-size: 12.5px; }
</style></head>
<body>

<button class="print-btn no-print" onclick="window.print()">Save as PDF</button>

<div class="nav"><b>ORCA</b><span>|</span><i>Authority Dashboard</i></div>

<div class="head">
  <div class="eyebrow">Official Advisory Report</div>
  <div class="title">${esc(p.topic.topic)}</div>
  <div class="date">${p.topic.region ? esc(p.topic.region) + " · " : ""}${date}</div>
</div>

<div class="wrap">
  ${assessmentHTML(p.assessment ?? undefined)}

  ${
    d
      ? `<div class="card">
          <div class="card-h"><span class="urgency">${urgent ? "High Urgency" : "Normal"}</span>&nbsp; ${esc(d.title)}</div>
          <div class="adv-target">${esc(d.target)}</div>
          <div class="adv-body">${escRich(d.body)}</div>
        </div>`
      : ""
  }

  <div class="card">
    <div class="card-h">Verified Facts</div>
    ${findingsHTML(p.findings)}
  </div>

  <div class="card">
    <div class="card-h">Coverage Trend · GDELT</div>
    ${spreadHTML(p.spread)}
  </div>

  <div class="card">
    <div class="card-h">Misinformation Detected</div>
    ${claimsHTML(p.claims)}
  </div>

  ${p.sources && p.sources.length ? `<div class="card"><div class="card-h">Sources Consulted</div>${sourcesHTML(p.sources)}</div>` : ""}
</div>

</body></html>`;
}

export function openAdvisoryReport(params: ReportParams) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(generateHTML(params));
  win.document.close();
}
