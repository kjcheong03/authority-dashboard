"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { revealSoft } from "@/lib/motion";
import type { LogLine } from "@/lib/useResearch";
import type { SourceRef, Phase } from "@/lib/types";

const LEVEL_COLOR: Record<LogLine["level"], string> = {
  info: "#34d399",
  warn: "#fbbf24",
  ok: "#22d3ee",
};

export function ResearchAgent({
  running,
  phase,
  pct,
  streamingUrl,
  logs,
  sources,
}: {
  running: boolean;
  phase: Phase | null;
  pct: number;
  streamingUrl: string | null;
  logs: LogLine[];
  sources: SourceRef[];
}) {
  const [tab, setTab] = useState<"log" | "browser">("log");
  const logEndRef = useRef<HTMLDivElement>(null);
  const userSwitched = useRef(false);

  // Auto-reveal the live browser the moment TinyFish hands us a streaming URL.
  useEffect(() => {
    if (streamingUrl && !userSwitched.current) setTab("browser");
  }, [streamingUrl]);

  useEffect(() => {
    // Auto-follow new log lines — but never on an empty log (e.g. a fresh page
    // reload), which would otherwise scroll the whole window to this mid-page panel.
    if (logs.length === 0) return;
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [logs]);

  // Idle = not started yet → show a calm grey screen instead of black.
  const idle = !running && logs.length === 0 && !streamingUrl;
  const screenBg = idle ? "#e7edea" : "#06121f";

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* tabs only */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-start" }}>
        <TabBtn active={tab === "log"} onClick={() => { userSwitched.current = true; setTab("log"); }}>
          Audit Trail
        </TabBtn>
        <TabBtn active={tab === "browser"} onClick={() => { userSwitched.current = true; setTab("browser"); }} live={!!streamingUrl && running}>
          Live
        </TabBtn>
      </div>

      {/* the screen — dark-green bezel, TV-like */}
      <div style={screen}>
        <div style={{ position: "relative", height: 320, background: screenBg, borderRadius: 12, overflow: "hidden" }}>
          {tab === "browser" ? (
            streamingUrl ? (
              <iframe
                src={streamingUrl}
                title="CARA live browser session"
                style={{ width: "100%", height: "100%", border: 0, background: "#06121f" }}
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <Placeholder text="waiting..." />
            )
          ) : (
            <div className="mono scroll-thin" style={{ height: "100%", overflowY: "auto", padding: "16px 18px", fontSize: 12.5, lineHeight: 1.75 }}>
              {logs.length === 0 && <span style={{ color: "#3f5b6b" }}>...</span>}
              {logs.map((l, i) => (
                <motion.div key={i} {...revealSoft} style={{ color: LEVEL_COLOR[l.level], whiteSpace: "pre-wrap" }}>
                  <span style={{ color: "#3f5b6b" }}>{l.ts ? `${l.ts}  ` : ""}</span>
                  {l.level === "warn" && "⚠ "}
                  {l.message}
                </motion.div>
              ))}
              {running && <div className="cursor" style={{ color: "#34d399" }} />}
              <div ref={logEndRef} />
            </div>
          )}
          {/* thin progress line — only while running, no text */}
          {running && (
            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 3, background: "rgba(255,255,255,0.08)" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: "var(--cara-teal)", transition: "width .4s ease" }} />
            </div>
          )}
        </div>
      </div>

      {/* source chips — only once consulted */}
      {sources.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <AnimatePresence>
            {sources.map((s) => (
              <motion.a key={s.name} layout {...revealSoft} href={s.url} target="_blank" rel="noreferrer" style={chip}>
                {s.name}
              </motion.a>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function TabBtn({ children, active, onClick, live }: { children: React.ReactNode; active: boolean; onClick: () => void; live?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 12, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer",
        border: active ? "1px solid #1d5c43" : "1px solid var(--cara-line)",
        background: active ? "rgba(29,92,67,.1)" : "#fff",
        color: active ? "#1d5c43" : "var(--cara-muted)",
      }}
    >
      {live && <span className="pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#ef4444" }} />}
      {children}
    </button>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#3f5b6b", fontSize: 13 }} className="mono">
      {text}
    </div>
  );
}

const screen: React.CSSProperties = {
  background: "#1d5c43",
  border: "1px solid #154532",
  borderRadius: 14,
  padding: 2,
  boxShadow: "0 10px 30px -12px rgba(21,69,50,0.5)",
};

const chip: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 10px",
  borderRadius: 999,
  background: "#eaf3f1",
  color: "var(--cara-navy)",
  textDecoration: "none",
  border: "1px solid var(--cara-line)",
};
