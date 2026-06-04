"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useResearch } from "@/lib/useResearch";
import { ResearchAgent } from "@/components/ResearchAgent";
import { Assessment } from "@/components/Assessment";
import { Findings } from "@/components/Findings";
import { Misinfo } from "@/components/Misinfo";
import { DraftPanel } from "@/components/DraftPanel";
import Mascot from "@/components/Mascot";
import { openAdvisoryReport } from "@/lib/exportReport";
import type { TopicInput } from "@/lib/types";
import { getCovidStats, covidDateBounds, defaultCovidDate } from "@/lib/historicalCovid";
import type { DengueClusters } from "@/lib/datagovsg";
import type { Spread } from "@/lib/types";

export default function Page() {
  const { state, start, stop, loadRun } = useResearch();
  const [topicText, setTopicText] = useState("");
  const [intelTab, setIntelTab] = useState<"findings" | "misinfo">("findings");

  // If the URL has ?run=<id> (e.g. clicked "Load" from /audit), hydrate that run.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("run");
    if (id) loadRun(id);
  }, [loadRun]);

  // ── Active-emergency stats: COVID is historical (date-picker), Dengue is live ──
  const [covidDate, setCovidDate] = useState(defaultCovidDate);
  const covidStats = getCovidStats(covidDate);
  const [dengueStats, setDengueStats] = useState<DengueClusters | null>(null);
  const [covidGdelt, setCovidGdelt] = useState<{ spread: Spread; fetched_at: string } | null>(null);
  const [dengueGdelt, setDengueGdelt] = useState<{ spread: Spread; fetched_at: string } | null>(null);
  const fetchGdelt = useCallback(async (topic: string, opts: { refresh?: boolean; date?: string } = {}): Promise<{ spread: Spread; fetched_at: string } | null> => {
    const params = new URLSearchParams({ topic });
    if (opts.refresh) params.set("refresh", "1");
    if (opts.date) params.set("date", opts.date);
    try {
      const r = await fetch(`/api/hazards/gdelt?${params}`);
      if (!r.ok) return null;
      const d = await r.json();
      return d && d.spread ? d : null;
    } catch {
      return null;
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/hazards/dengue").then((r) => r.json()).then((d) => { if (!cancelled) setDengueStats(d); }).catch(() => {});
    fetchGdelt("Dengue").then((d) => { if (!cancelled) setDengueGdelt(d); });
    return () => { cancelled = true; };
  }, [fetchGdelt]);
  // COVID GDELT follows the date picker — re-fetch whenever covidDate changes.
  useEffect(() => {
    let cancelled = false;
    setCovidGdelt(null); // show "querying" state during the swap
    fetchGdelt("COVID-19", { date: covidDate }).then((d) => { if (!cancelled) setCovidGdelt(d); });
    return () => { cancelled = true; };
  }, [covidDate, fetchGdelt]);

  const topic: TopicInput = { topic: topicText.trim(), region: "", audience: "Caregivers" };
  const canRun = topic.topic.length > 1;
  const hasResults = !state.running && (state.findings.length > 0 || state.draft !== null);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="topbar" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 22px", background: "#002C77" }}>
        <span style={{ display: "inline-flex", marginTop: -4 }}>
          <Mascot size={40} variant="calm" animated={false} />
        </span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", letterSpacing: -0.1 }}>Authority Dashboard</span>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
          <Link href="/" style={{ fontSize: 13, fontWeight: 700, color: "#fff", textDecoration: "none", borderBottom: "2px solid #A6C8FF", paddingBottom: 2 }}>
            Live Scan
          </Link>
          <Link href="/audit" style={{ fontSize: 13, fontWeight: 600, color: "#cfe0ff", textDecoration: "none" }}>
            Audit Trail
          </Link>
        </nav>
      </header>

      {/* ── Active emergencies — quick-pick hazard cards with live stats ─ */}
      <div style={{ padding: "24px 22px 0", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", alignItems: "stretch" }}>
          <HazardCard
            label="COVID-19"
            discussion={covidGdelt}
            onRefreshDiscussion={async () => {
              const fresh = await fetchGdelt("COVID-19", { refresh: true, date: covidDate });
              if (fresh) setCovidGdelt(fresh);
            }}
            dotColor={covidStats.tierColor}
            tier={covidStats.tier}
            tierColor={covidStats.tierColor}
            statValue={covidStats.cases.toLocaleString("en-SG")}
            statUnit="weekly cases"
            trend={covidStats.trendDir === "rising" ? "up" : covidStats.trendDir === "easing" ? "down" : "flat"}
            trendPct={covidStats.trendPct ?? undefined}
            sourceLabel="MOH"
            subtitle={`${covidStats.seniorHosp} senior hospitalisations · ${covidStats.seniorIcu} ICU`}
            active={topicText.trim().toLowerCase() === "covid-19"}
            disabled={state.running}
            onClick={() => {
              setTopicText("COVID-19");
              if (!state.running) start({ ...topic, topic: "COVID-19" }, "live");
            }}
            dateInput={
              <DatePickerTrigger
                value={covidDate}
                displayValue={covidStats.friendlyDate}
                onChange={setCovidDate}
                min={covidDateBounds.min}
                max={covidDateBounds.max}
                disabled={state.running}
              />
            }
          />
          <HazardCard
            label="Dengue"
            dotColor="#b45309"
            tier={dengueStats ? (dengueStats.totalClusters >= 10 ? "ELEVATED" : dengueStats.totalClusters >= 4 ? "WATCH" : "LOW") : "—"}
            tierColor="#b45309"
            statValue={dengueStats ? String(dengueStats.totalClusters) : "—"}
            statUnit="active clusters"
            trend="flat"
            sourceLabel="NEA · Live · Today"
            subtitle={dengueStats ? `${dengueStats.totalCases} cases islandwide` : "loading live cluster data…"}
            active={topicText.trim().toLowerCase() === "dengue"}
            disabled={state.running}
            onClick={() => {
              setTopicText("Dengue");
              if (!state.running) start({ ...topic, topic: "Dengue" }, "live");
            }}
            discussion={dengueGdelt}
            onRefreshDiscussion={async () => {
              const fresh = await fetchGdelt("Dengue", { refresh: true });
              if (fresh) setDengueGdelt(fresh);
            }}
          />
        </div>
      </div>

      {/* ── Topic input + controls ──────────────────────────────────────── */}
      <div className="topic-row" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 22px 16px", flexWrap: "wrap" }}>
        <input
          className="topic-input"
          value={topicText}
          onChange={(e) => setTopicText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canRun && !state.running) start(topic, "live"); }}
          placeholder="…or type a custom topic"
          disabled={state.running}
          style={{ width: 440, maxWidth: "70vw", fontSize: 13.5, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--cara-line)", background: "#fff" }}
        />
        {state.running ? (
          <button onClick={stop} style={btnGhost}>Stop</button>
        ) : (
          <button onClick={() => start(topic, "live")} disabled={!canRun} aria-label="Run research" style={{ ...iconBtn, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "not-allowed" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </button>
        )}
        {hasResults && (
          <button
            onClick={() => openAdvisoryReport({ topic, assessment: state.assessment, draft: state.draft, findings: state.findings, claims: state.claims, spread: state.spread, sources: state.sources })}
            style={btnGhost}
          >
            ⬇ Export PDF
          </button>
        )}
        {state.error && <span style={{ fontSize: 12, color: "var(--cara-red)" }}>● {state.error}</span>}
      </div>

      {/* ── Workspace ───────────────────────────────────────────────────── */}
      <main className="workspace" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {state.assessment && <Assessment assessment={state.assessment} />}

        {/* Surveillance grid spans full width */}
        <ResearchAgent
          running={state.running}
          phase={state.phase}
          pct={state.pct}
          streamingUrl={state.streamingUrl}
          channelStreamingUrls={state.channelStreamingUrls}
          sources={state.sources}
          findings={state.findings}
          claims={state.claims}
          spread={state.spread}
        />

        {/* Intel tabs beside the broadcast container */}
        <div className="workspace-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <IntelTab active={intelTab === "findings"} onClick={() => setIntelTab("findings")}>
                Verified Facts{state.findings.length > 0 ? ` · ${state.findings.length}` : ""}
              </IntelTab>
              <IntelTab active={intelTab === "misinfo"} onClick={() => setIntelTab("misinfo")}>
                Misinformation{state.claims.length > 0 ? ` · ${state.claims.length}` : ""}
              </IntelTab>
            </div>
            <section style={{ background: "var(--cara-panel)", border: "1px solid var(--cara-line)", borderRadius: 14, overflow: "hidden" }}>
              {intelTab === "findings" ? <Findings findings={state.findings} /> : <Misinfo claims={state.claims} spread={state.spread} />}
            </section>
          </div>

          <DraftPanel
            draft={state.draft}
            runId={state.runId}
            findings={state.findings}
            claims={state.claims}
            onRefresh={() => (state.runId ? loadRun(state.runId) : Promise.resolve())}
          />
        </div>
      </main>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: "#fff", background: "var(--cara-blue)", border: 0, padding: "8px 16px", borderRadius: 8, cursor: "pointer" };
const iconBtn: React.CSSProperties = { display: "grid", placeItems: "center", width: 38, height: 38, background: "#002C77", border: 0, borderRadius: 8 };
const btnGhost: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: "var(--cara-navy)", background: "#fff", border: "1.5px solid var(--cara-navy)", padding: "8px 14px", borderRadius: 8, cursor: "pointer" };

function GdeltCard({
  topic,
  cached,
  onRefresh,
}: {
  topic: string;
  cached: { spread: Spread; fetched_at: string } | null;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const velocityColor: Record<string, string> = {
    SURGING: "#dc2626", RISING: "#b45309", STEADY: "#1d4ed8", DECLINING: "#16a34a", MINIMAL: "#94a3b8",
  };
  const spread = cached?.spread ?? null;
  const sgVelocity = spread?.singaporeVelocity ?? "—";
  const vColor = velocityColor[sgVelocity] ?? "#94a3b8";
  // Monthly total of SG mentions (sum of timeline) — replaces the 24h global figure.
  const timeline = spread?.timeline ?? [];
  const sgMonthly = timeline.reduce((s, p) => s + (p.sg ?? 0), 0);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  return (
    <div
      style={{
        flex: "0 1 220px",
        minWidth: 200,
        background: "#fff",
        border: "1px solid var(--cara-line)",
        borderRadius: 14,
        padding: "12px 14px",
        boxShadow: "0 2px 8px -4px rgba(15,39,71,0.12)",
        display: "flex", flexDirection: "column", gap: 8,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13 }}>💬</span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, color: "var(--cara-muted)", flex: 1 }}>
          DISCUSSION RATE · {topic.toUpperCase()}
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh from BigQuery"
          aria-label="Refresh from BigQuery"
          style={{
            display: "grid", placeItems: "center",
            width: 22, height: 22, borderRadius: 6,
            border: "1px solid var(--cara-line)", background: "#fff",
            color: "var(--cara-muted)", cursor: refreshing ? "default" : "pointer",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ animation: refreshing ? "spin .8s linear infinite" : undefined }}>
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>
      {spread ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, color: "var(--cara-ink)", lineHeight: 1 }}>
              {sgMonthly.toLocaleString("en-SG")}
            </span>
            <span style={{ fontSize: 10.5, color: "var(--cara-muted)", fontWeight: 600 }}>last 30d</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: vColor, letterSpacing: 0.3 }}>{sgVelocity}</div>
          {timeline.length >= 2 && <SgBars timeline={timeline} color={vColor} />}
        </>
      ) : (
        <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--cara-muted)", fontSize: 12 }}>
          {refreshing ? "querying…" : "no data"}
        </div>
      )}
    </div>
  );
}

function SgBars({ timeline, color }: { timeline: Array<{ date: string; sg: number }>; color: string }) {
  const values = timeline.map((p) => p.sg);
  const max = Math.max(...values, 1);
  const bw = 100 / values.length;
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" style={{ width: "100%", height: 28, display: "block" }} aria-label="30-day SG mentions">
      {values.map((v, i) => {
        const h = Math.max(1.2, (v / max) * 26);
        return <rect key={i} x={i * bw} y={28 - h} width={bw * 0.7} height={h} fill={color} opacity={i === values.length - 1 ? 1 : 0.6} />;
      })}
    </svg>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function DatePickerTrigger({
  value,
  displayValue,
  onChange,
  min,
  max,
  disabled,
}: {
  value: string;
  displayValue: string;
  onChange: (v: string) => void;
  min: string;
  max: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          // showPicker is supported in all modern browsers; falls back gracefully.
          inputRef.current?.showPicker?.();
        }}
        disabled={disabled}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 10.5, fontWeight: 600,
          color: disabled ? "var(--cara-muted)" : "#002C77",
          background: "transparent", border: "none", padding: 0,
          fontFamily: "inherit",
          cursor: disabled ? "not-allowed" : "pointer",
          letterSpacing: 0.2,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="17" rx="2" />
          <line x1="16" y1="2.5" x2="16" y2="6.5" />
          <line x1="8" y1="2.5" x2="8" y2="6.5" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {displayValue}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        min={min}
        max={max}
        disabled={disabled}
        style={{
          position: "absolute", left: 0, top: 0,
          width: 1, height: 1, opacity: 0, pointerEvents: "none",
        }}
        aria-hidden="true"
        tabIndex={-1}
      />
    </span>
  );
}

function HazardCard({
  label,
  dotColor,
  tier,
  tierColor,
  statValue,
  statUnit,
  trend,
  trendPct,
  sourceLabel,
  subtitle,
  active,
  disabled,
  onClick,
  dateInput,
  discussion,
  onRefreshDiscussion,
}: {
  label: string;
  dotColor: string;
  tier: string;
  tierColor: string;
  statValue: string;
  statUnit: string;
  trend: "up" | "down" | "flat";
  trendPct?: number;
  sourceLabel: string;
  subtitle: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  dateInput?: React.ReactNode;
  discussion?: { spread: Spread; fetched_at: string } | null;
  onRefreshDiscussion?: () => Promise<void>;
}) {
  const trendChar = trend === "up" ? "▲" : trend === "down" ? "▼" : "—";
  const trendColor = trend === "up" ? "#dc2626" : trend === "down" ? "#16a34a" : "var(--cara-muted)";
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); }
      }}
      style={{
        flex: "1 1 300px",
        maxWidth: 380,
        textAlign: "left",
        background: "#fff",
        border: active ? "1.5px solid #002C77" : "1px solid var(--cara-line)",
        borderRadius: 14,
        padding: "16px 18px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: active
          ? "0 6px 18px -8px rgba(0,44,119,0.4)"
          : "0 2px 8px -4px rgba(15,39,71,0.12)",
        transition: "border-color .2s, box-shadow .2s, transform .12s",
        fontFamily: "inherit",
        outline: "none",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {/* top row: dot + label + tier badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--cara-ink)", letterSpacing: -0.1 }}>
          {label}
        </span>
        <span style={{
          marginLeft: "auto",
          fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4,
          padding: "3px 7px", borderRadius: 4,
          background: `${tierColor}15`, color: tierColor,
        }}>
          {tier}
        </span>
      </div>

      {/* big stat */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: "var(--cara-ink)", lineHeight: 1 }}>
          {statValue}
        </span>
        <span style={{ fontSize: 13, color: "var(--cara-muted)", fontWeight: 500 }}>
          {statUnit}
        </span>
        {typeof trendPct === "number" && (
          <span style={{
            marginLeft: "auto",
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 12, fontWeight: 800,
            padding: "3px 8px", borderRadius: 999,
            background: `${trendColor}15`, color: trendColor,
          }}>
            <span style={{ fontSize: 9 }}>{trendChar}</span>
            {Math.abs(trendPct)}%
          </span>
        )}
      </div>

      {/* subtitle */}
      <div style={{ fontSize: 12.5, color: "#334155", lineHeight: 1.4 }}>
        {subtitle}
      </div>

      {/* footer: source · date picker (when present) */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "var(--cara-muted)", fontWeight: 600, letterSpacing: 0.2, paddingTop: 4, borderTop: "1px solid #eef2f0" }}>
        <span>{sourceLabel}</span>
        {dateInput && <span style={{ opacity: 0.5 }}>·</span>}
        {dateInput}
      </div>

      {/* discussion-rate strip — GDELT mention volume + 30d chart, in-card so
          it's unambiguously attached to this hazard. */}
      {(discussion !== undefined) && (
        <DiscussionStrip
          spread={discussion?.spread ?? null}
          onRefresh={onRefreshDiscussion}
        />
      )}
    </div>
  );
}

function DiscussionStrip({
  spread,
  onRefresh,
}: {
  spread: Spread | null;
  onRefresh?: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const velocityColor: Record<string, string> = {
    SURGING: "#dc2626", RISING: "#b45309", STEADY: "#1d4ed8", DECLINING: "#16a34a", MINIMAL: "#94a3b8",
  };
  const v = spread?.singaporeVelocity ?? "—";
  const vColor = velocityColor[v] ?? "#94a3b8";
  const timeline = spread?.timeline ?? [];
  const monthly = timeline.reduce((s, p) => s + (p.sg ?? 0), 0);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        marginTop: 8, paddingTop: 8, borderTop: "1px dashed #d6def0",
        display: "flex", flexDirection: "column", gap: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--cara-ink)" }}>
          {spread ? monthly.toLocaleString("en-SG") : "—"}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--cara-muted)", fontWeight: 600 }}>
          mentions · 30d
        </span>
        <span style={{ marginLeft: 4, fontSize: 10, fontWeight: 800, color: vColor, letterSpacing: 0.3 }}>
          {v}
        </span>
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Refresh from BigQuery"
            aria-label="Refresh discussion rate"
            style={{
              marginLeft: "auto",
              display: "grid", placeItems: "center",
              width: 20, height: 20, borderRadius: 5,
              border: "1px solid var(--cara-line)", background: "#fff",
              color: "var(--cara-muted)", cursor: refreshing ? "default" : "pointer",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ animation: refreshing ? "spin .8s linear infinite" : undefined }}>
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
        )}
      </div>
      {spread && timeline.length >= 2 ? (
        <SgBars timeline={timeline} color={vColor} />
      ) : (
        <div style={{ height: 28, display: "grid", placeItems: "center", color: "var(--cara-muted)", fontSize: 10 }}>
          {refreshing ? "querying…" : "no data"}
        </div>
      )}
    </div>
  );
}

function IntelTab({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        font: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer",
        border: active ? "1px solid #002C77" : "1px solid var(--cara-line)",
        background: active ? "rgba(0,44,119,.1)" : "#fff",
        color: active ? "#002C77" : "var(--cara-muted)",
      }}
    >
      {children}
    </button>
  );
}
