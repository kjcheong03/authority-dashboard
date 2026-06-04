"use client";

import { AnimatePresence, motion } from "framer-motion";
import { revealSoft } from "@/lib/motion";
import type { SourceRef, Phase, Finding, Claim, Spread } from "@/lib/types";
import { SurveillanceGrid } from "./SurveillanceGrid";

export function ResearchAgent({
  running,
  phase,
  pct,
  streamingUrl,
  channelStreamingUrls,
  sources,
  findings,
  claims,
  spread,
}: {
  running: boolean;
  phase: Phase | null;
  pct: number;
  streamingUrl: string | null;
  channelStreamingUrls: Record<string, string>;
  sources: SourceRef[];
  findings: Finding[];
  claims: Claim[];
  spread: Spread | null;
}) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={surveillancePanel}>
        <SurveillanceGrid
          phase={phase ?? "ingest"}
          running={running}
          streamingUrl={streamingUrl ?? undefined}
          channelStreamingUrls={channelStreamingUrls}
          findings={findings}
          claims={claims}
          spread={spread}
        />
        {running && (
          <div style={{ marginTop: 10, height: 3, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#002C77", transition: "width .4s ease" }} />
          </div>
        )}
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

// Surveillance panel — light, just a border. The grey container backdrop sits
// inside, behind the mini tile row only (Featured stays on the white panel).
const surveillancePanel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid var(--cara-line)",
  borderRadius: 14,
  padding: "14px 14px 12px",
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
