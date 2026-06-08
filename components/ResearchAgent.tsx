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
  // Has the run produced any results? Used to switch the scanner status text
  // from running → "Completed" once the agent finishes a non-empty run.
  const hasResults = findings.length > 0 || claims.length > 0;
  const status: "idle" | "running" | "completed" =
    running ? "running" : hasResults ? "completed" : "idle";

  // On idle there's nothing to render (no scanner, no progress bar). Return
  // null instead of an empty section so the parent workspace flex doesn't
  // reserve a `gap: 16` slot above/below an invisible child — that phantom
  // gap pushed the broadcast container down ~32px from the topic row.
  if (status === "idle") return null;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SurveillanceGrid
        phase={phase ?? "ingest"}
        running={running}
        status={status}
        streamingUrl={streamingUrl ?? undefined}
        channelStreamingUrls={channelStreamingUrls}
        findings={findings}
        claims={claims}
        spread={spread}
      />
      {running && (
        <div
          style={{
            marginTop: 4, height: 3, borderRadius: 2, overflow: "hidden",
            background: "rgba(0,44,119,0.10)",
            maxWidth: 280, margin: "0 auto",
            width: "100%",
          }}
        >
          <div style={{ height: "100%", width: `${pct}%`, background: "#002C77", transition: "width .4s ease" }} />
        </div>
      )}
    </section>
  );
}

