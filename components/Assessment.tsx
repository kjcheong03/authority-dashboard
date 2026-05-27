"use client";

import { motion } from "framer-motion";
import { reveal } from "@/lib/motion";
import type { Assessment as A } from "@/lib/types";

const COLOR: Record<string, string> = {
  BROADCAST: "#1d4ed8",
  MONITOR: "#b45309",
  "NO ACTION": "#16a34a",
};

export function Assessment({ assessment: a }: { assessment: A }) {
  const c = COLOR[a.verdict] ?? "#1d4ed8";
  return (
    <motion.section
      {...reveal}
      style={{ background: "var(--cara-panel)", border: `1px solid var(--cara-line)`, borderLeft: `4px solid ${c}`, borderRadius: 14, padding: "16px 20px" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 360px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 10.5, letterSpacing: 0.6, color: "var(--cara-muted)" }}>RECOMMENDATION</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: c, letterSpacing: -0.3 }}>{a.verdict}</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--cara-ink)", lineHeight: 1.5, margin: "6px 0 0" }}>{a.rationale}</p>
        </div>
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <div style={{ color: "var(--cara-muted)" }}>Urgency <strong style={{ color: a.urgency === "HIGH" ? "var(--cara-red)" : "var(--cara-ink)" }}>{a.urgency}</strong></div>
        </div>
      </div>
    </motion.section>
  );
}
