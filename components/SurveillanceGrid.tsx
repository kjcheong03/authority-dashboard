"use client";

/* ───────────────────────────────────────────────────────────────────────────
 * SurveillanceGrid — minimal scanner.
 *
 * Idle: a static radar dish sitting quietly on the page (no white card,
 *       no shadow — just sits on the page background).
 * Running: same dish, but the pulse rings + sweep + core animations engage,
 *          with the current phase label underneath.
 * ─────────────────────────────────────────────────────────────────────────── */

import type React from "react";
import type { Phase, Spread, Finding, Claim } from "@/lib/types";

const NAVY = "#002C77";

export function SurveillanceGrid(props: {
  phase: Phase | null;
  running: boolean;
  status?: "idle" | "running" | "completed";
  streamingUrl?: string | null;
  channelStreamingUrls?: Record<string, string>;
  findings: Finding[];
  claims: Claim[];
  spread: Spread | null;
}): React.JSX.Element | null {
  const { running } = props;
  // Default the status from the running flag for back-compat with any call
  // site that hasn't been updated. ResearchAgent always passes status now.
  const status = props.status ?? (running ? "running" : "idle");

  // Idle = no run has ever fired and no results sit in state. Render nothing
  // so the page doesn't show a phantom scanner before the officer searches.
  if (status === "idle") return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "32px 0",
      }}
    >
      {/* Inline keyframes — only applied when running. */}
      <style>{`
        @keyframes orcaSonar {
          0%   { transform: scale(0.35); opacity: 0.85; }
          80%  { opacity: 0.0; }
          100% { transform: scale(1.6);  opacity: 0.0; }
        }
        @keyframes orcaSonarCore {
          0%, 100% { transform: scale(1);    opacity: 1;   }
          50%      { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes orcaSweep {
          0%   { transform: rotate(0deg);   }
          100% { transform: rotate(360deg); }
        }
      `}</style>

      {/* The radar dish only exists while a scan is in flight. Once the run
          completes it disappears entirely, leaving only the channel grid. */}
      {status === "running" && (
      <div
        style={{
          position: "relative",
          width: 140,
          height: 140,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Static grid rings — present so the dish reads as a scanner. */}
        <span
          style={{
            position: "absolute",
            inset: 14,
            borderRadius: "50%",
            border: "1px solid var(--orca-line)",
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            position: "absolute",
            inset: 36,
            borderRadius: "50%",
            border: "1px solid var(--orca-line)",
            pointerEvents: "none",
          }}
        />

        {/* Pulse rings — only render while running. */}
        {running && [0, 0.6, 1.2].map((delay, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `2px solid ${NAVY}`,
              animation: `orcaSonar 1.8s ease-out ${delay}s infinite`,
            }}
          />
        ))}

        {/* Rotating sweep — only while running. */}
        {running && (
          <span
            style={{
              position: "absolute",
              inset: 14,
              borderRadius: "50%",
              background:
                "conic-gradient(from 0deg, rgba(0,44,119,0.0) 0deg, rgba(0,44,119,0.0) 270deg, rgba(0,44,119,0.28) 350deg, rgba(0,44,119,0.45) 360deg)",
              animation: "orcaSweep 2.4s linear infinite",
            }}
          />
        )}

        {/* Core — same navy tone in every state; pulses only when running. */}
        <span
          style={{
            position: "relative",
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: NAVY,
            boxShadow: running
              ? "0 0 0 6px rgba(0,44,119,0.18)"
              : "0 0 0 4px rgba(0,44,119,0.10)",
            animation: running ? "orcaSonarCore 1.4s ease-in-out infinite" : "none",
            transition: "box-shadow .2s",
          }}
        />
      </div>
      )}

      {/* Label: "Running" only while a scan is in flight. Once the run finishes
          the label is hidden — completion is signalled by the tick beside the
          Broadcast panel instead. (Idle was handled by the early return.) */}
      {status === "running" && (
        <div
          style={{
            color: NAVY,
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          Running
        </div>
      )}
    </div>
  );
}
