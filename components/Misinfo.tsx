"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { reveal, revealSoft } from "@/lib/motion";
import type { Claim, Spread } from "@/lib/types";

const VEL_COLOR: Record<string, string> = {
  SURGING: "#dc2626",
  RISING: "#b45309",
  STEADY: "#1d4ed8",
  DECLINING: "#16a34a",
  MINIMAL: "#94a3b8",
};

const TONE_COLOR: Record<string, string> = { ALARMIST: "#dc2626", NEGATIVE: "#b45309", NEUTRAL: "#1d4ed8", POSITIVE: "#16a34a" };

const fmtNum = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`);
const fmtDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${+day} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m - 1] ?? ""}`;
};

function Bars({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const bw = 100 / values.length;
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 30, display: "block" }}>
      {values.map((v, i) => {
        const h = Math.max(1.5, (v / max) * 28);
        return <rect key={i} x={i * bw} y={30 - h} width={bw * 0.62} height={h} fill={color} opacity={i === values.length - 1 ? 1 : 0.55} />;
      })}
    </svg>
  );
}

function Line({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values), rng = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / rng) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 30, display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SpreadBanner({ spread }: { spread: Spread }) {
  const tl = spread.timeline ?? [];
  const range = tl.length ? `${fmtDate(tl[0].date)}–${fmtDate(tl[tl.length - 1].date)}` : "";
  const peak = (vals: number[]) => (vals.length ? fmtNum(Math.max(...vals)) : "");
  return (
    <motion.div {...reveal} style={{ padding: "12px 14px", borderBottom: "1px solid var(--cara-line)", background: "#fbfdfc" }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <SpreadStat label="Global" velocity={spread.velocityLabel} sub={`${fmtNum(spread.totalArticles)} · peak ${peak(tl.map((p) => p.global))}/d`} chart={<Bars values={tl.map((p) => p.global)} color="#1d4ed8" />} range={range} />
        <SpreadStat label="🇸🇬 Singapore" velocity={spread.singaporeVelocity} sub={`${fmtNum(spread.singaporeArticles)} · peak ${peak(tl.map((p) => p.sg))}/d`} chart={<Bars values={tl.map((p) => p.sg)} color="#16a34a" />} range={range} />
        {spread.toneLabel && (
          <SpreadStat label="Media tone" velocity={spread.toneLabel} sub={typeof spread.avgTone === "number" ? `avg ${spread.avgTone}` : ""} chart={<Line values={tl.filter((p) => typeof p.tone === "number").map((p) => p.tone as number)} color="#b45309" />} range={range} colorMap={TONE_COLOR} />
        )}
      </div>
      <div style={{ fontSize: 9.5, color: "var(--cara-muted)", marginTop: 7, letterSpacing: 0.2 }}>
        from GDELT{spread.source === "bigquery" ? " (BigQuery)" : ""}
      </div>
    </motion.div>
  );
}

function SpreadStat({ label, velocity, sub, chart, range, colorMap }: { label: string; velocity: string; sub: string; chart: React.ReactNode; range: string; colorMap?: Record<string, string> }) {
  const col = (colorMap ?? VEL_COLOR)[velocity] ?? "#94a3b8";
  return (
    <div style={{ flex: "1 1 150px", border: "1px solid var(--cara-line)", borderRadius: 8, padding: "8px 11px", background: "#fff" }}>
      <div style={{ fontSize: 10, color: "var(--cara-muted)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: col, letterSpacing: 0.3 }}>{velocity}</div>
      <div style={{ marginTop: 6 }}>{chart}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--cara-muted)", marginTop: 3 }}>
        <span>{range}</span>
        <span>{sub}</span>
      </div>
    </div>
  );
}

export function Misinfo({ claims, spread }: { claims: Claim[]; spread: Spread | null }) {
  return (
    <div>
      {spread ? (
        <SpreadBanner spread={spread} />
      ) : (
        claims.length > 0 && (
          <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--cara-line)", background: "#fbfdfc", fontSize: 10.5, color: "var(--cara-muted)" }}>
            GDELT coverage signal unavailable this run · via GDELT
          </div>
        )
      )}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {claims.length === 0 && <p style={{ fontSize: 13, color: "var(--cara-muted)", margin: 0 }}>...</p>}
        <AnimatePresence>
          {claims.map((c) => (
            <ClaimCard key={c.id} claim={c} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ClaimCard({ claim: c }: { claim: Claim }) {
  const danger = c.severity === "UNVERIFIED";
  const [open, setOpen] = useState(false);
  const hasDetails = !!(c.analysis || c.contradicts || c.fix || c.factChecks?.length || c.origin);

  return (
    <motion.div
      {...reveal}
      style={{
        borderLeft: `3px solid ${danger ? "var(--cara-red)" : "#94a3b8"}`,
        background: danger ? "#fef2f2" : "#f8fafc",
        borderRadius: "0 10px 10px 0",
        padding: "11px 13px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
        <span style={{ ...tag, background: danger ? "var(--cara-red)" : "#64748b" }}>
          {danger ? "UNVERIFIED" : "MINOR DISCREPANCY"}
        </span>
        {c.where && <span style={metaTag}>{c.where}</span>}
        {c.shares && <span style={{ fontSize: 10.5, color: "var(--cara-muted)" }}>{c.shares}</span>}
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.45, margin: 0, color: danger ? "#991b1b" : "#334155" }}>
        “{c.text}”
      </p>

      {hasDetails && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{
            display: "flex", alignItems: "center", gap: 4, marginTop: 8, padding: 0,
            background: "none", border: 0, cursor: "pointer",
            fontSize: 11, fontWeight: 700, letterSpacing: 0.2,
            color: danger ? "#b91c1c" : "#64748b",
          }}
        >
          {open ? "Hide details" : "Details"}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} style={{ fontSize: 9, lineHeight: 1 }}>
            ▼
          </motion.span>
        </button>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ marginTop: 8 }}
          >
            {(c.analysis || c.contradicts) && (
              <p style={line}>
                <span style={lbl}>Why it&apos;s false:</span> {c.analysis}
                {c.analysis && c.contradicts ? " " : ""}
                {c.contradicts && <span style={{ color: "#64748b" }}>Contradicts verified guidance — {c.contradicts}.</span>}
              </p>
            )}
            {c.fix && (
              <div style={{ marginTop: 8, padding: "7px 9px", background: "#ecfdf5", borderRadius: 7, fontSize: 11.5, color: "#065f46", lineHeight: 1.4 }}>
                <strong>Suggested clarification: </strong>
                {c.fix}
              </div>
            )}

            {c.factChecks && c.factChecks.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                {c.factChecks.map((f, i) => (
                  <a
                    key={i}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: 7, textDecoration: "none", padding: "6px 9px", background: "#eef2ff", borderRadius: 7 }}
                  >
                    <span style={{ fontSize: 8.5, fontWeight: 700, color: "#fff", background: "#4338ca", padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>
                      ✓ {f.rating}
                    </span>
                    <span style={{ fontSize: 10.5, color: "#3730a3", lineHeight: 1.3 }}>
                      Fact-checked by <strong>{f.publisher}</strong>
                    </span>
                  </a>
                ))}
              </div>
            )}

            {c.origin && <OriginTrace origin={c.origin} />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const EVENT_COLOR: Record<string, string> = {
  origin: "#dc2626",
  amplification: "#b45309",
  investigation: "#1d4ed8",
  debunk: "#16a34a",
};

function OriginTrace({ origin }: { origin: NonNullable<Claim["origin"]> }) {
  return (
    <motion.div {...revealSoft} style={{ marginTop: 9, paddingTop: 9, borderTop: "1px dashed #e2b8b8" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: "#7c2d12" }}>🔎 ORIGIN TRACE</span>
        {origin.singleSource && (
          <span style={{ fontSize: 8.5, fontWeight: 700, color: "#fff", background: "#dc2626", padding: "1px 6px", borderRadius: 4 }}>SINGLE SOURCE</span>
        )}
      </div>

      {origin.summary && <p style={{ fontSize: 11.5, color: "#475569", lineHeight: 1.45, margin: "0 0 8px" }}>{origin.summary}</p>}

      {origin.timeline.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {origin.timeline.map((e, i) => {
            const col = EVENT_COLOR[e.type] ?? "#64748b";
            return (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: col, marginTop: 4, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.3, color: col, textTransform: "uppercase" }}>{e.type}</span>
                    {e.date && <span style={{ fontSize: 9.5, color: "var(--cara-muted)" }}>{e.date}</span>}
                    {e.url ? (
                      <a href={e.url} target="_blank" rel="noreferrer" style={{ fontSize: 10.5, fontWeight: 700, color: "var(--cara-blue)", textDecoration: "underline" }}>{e.outlet}</a>
                    ) : (
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: "#334155" }}>{e.outlet}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10.5, color: "#475569", lineHeight: 1.4 }}>{e.event}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

const tag: React.CSSProperties = { fontSize: 9, fontWeight: 700, color: "#fff", padding: "2px 6px", borderRadius: 4, letterSpacing: 0.4 };
const metaTag: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: "#475569", background: "#e2e8f0", padding: "1px 6px", borderRadius: 4 };
const line: React.CSSProperties = { fontSize: 11.5, lineHeight: 1.45, margin: "3px 0", color: "#475569" };
const lbl: React.CSSProperties = { fontWeight: 700, color: "#334155" };
