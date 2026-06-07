"use client";

import type { Phase, Finding, Claim, Spread, SourceRef } from "@/lib/types";
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

    </section>
  );
}

// Surveillance panel — light, just a border. The grey container backdrop sits
// inside, behind the mini tile row only (Featured stays on the white panel).
const surveillancePanel: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid var(--orca-line)",
  borderRadius: 14,
  padding: "14px 14px 12px",
};

