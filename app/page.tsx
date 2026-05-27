"use client";

import { useState } from "react";
import { useResearch } from "@/lib/useResearch";
import { ResearchAgent } from "@/components/ResearchAgent";
import { Assessment } from "@/components/Assessment";
import { Findings } from "@/components/Findings";
import { Misinfo } from "@/components/Misinfo";
import { DraftPanel } from "@/components/DraftPanel";
import { openAdvisoryReport } from "@/lib/exportReport";
import type { TopicInput } from "@/lib/types";

export default function Page() {
  const { state, start, stop } = useResearch();
  const [topicText, setTopicText] = useState("");
  const [intelTab, setIntelTab] = useState<"findings" | "misinfo">("findings");

  const topic: TopicInput = { topic: topicText.trim(), region: "", audience: "Caregivers" };
  const canRun = topic.topic.length > 1;
  const hasResults = !state.running && (state.findings.length > 0 || state.draft !== null);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="topbar" style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 22px", background: "#1d5c43" }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#9fe3c4", letterSpacing: 0.5 }}>CARA</span>
        <span style={{ color: "rgba(159,227,196,0.45)" }}>|</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#ffffff" }}>Authority Dashboard</span>
      </header>

      {/* ── Topic input + controls ──────────────────────────────────────── */}
      <div className="topic-row" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "28px 22px 16px", flexWrap: "wrap" }}>
        <input
          className="topic-input"
          value={topicText}
          onChange={(e) => setTopicText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canRun && !state.running) start(topic, "live"); }}
          placeholder="Search"
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

        <div className="workspace-grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <ResearchAgent
              running={state.running}
              phase={state.phase}
              pct={state.pct}
              streamingUrl={state.streamingUrl}
              logs={state.logs}
              sources={state.sources}
            />
            <DraftPanel draft={state.draft} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* tab row — aligns with the Audit Trail/Live row on the left */}
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
        </div>
      </main>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: "#fff", background: "var(--cara-blue)", border: 0, padding: "8px 16px", borderRadius: 8, cursor: "pointer" };
const iconBtn: React.CSSProperties = { display: "grid", placeItems: "center", width: 38, height: 38, background: "#1d5c43", border: 0, borderRadius: 8 };
const btnGhost: React.CSSProperties = { fontSize: 12.5, fontWeight: 700, color: "var(--cara-navy)", background: "#fff", border: "1.5px solid var(--cara-navy)", padding: "8px 14px", borderRadius: 8, cursor: "pointer" };

function IntelTab({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        font: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer",
        border: active ? "1px solid #1d5c43" : "1px solid var(--cara-line)",
        background: active ? "rgba(29,92,67,.1)" : "#fff",
        color: active ? "#1d5c43" : "var(--cara-muted)",
      }}
    >
      {children}
    </button>
  );
}
