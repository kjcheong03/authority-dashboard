"use client";

import { motion, AnimatePresence } from "framer-motion";
import { reveal } from "@/lib/motion";
import type { Finding } from "@/lib/types";

const AGENCY_COLOR: Record<string, string> = {
  MOH: "#1d4ed8",
  NEA: "#0fae8e",
  WHO: "#6d28d9",
};

export function Findings({ findings }: { findings: Finding[] }) {
  return (
    <div style={{ padding: "8px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
      {findings.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--cara-muted)", margin: "4px 0" }}>...</p>
      )}
      <AnimatePresence>
        {findings.map((f, i) => (
          <motion.div key={i} layout {...reveal} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div>
              <span style={{ ...badge, background: AGENCY_COLOR[f.agency] ?? "#475569" }}>{f.agency}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--cara-ink)" }}>{f.text}</div>
            {f.url ? (
              <div style={{ fontSize: 10.5 }}>
                <a
                  href={f.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: AGENCY_COLOR[f.agency] ?? "#475569", textDecoration: "underline", fontWeight: 600 }}
                >
                  View source ↗
                </a>
              </div>
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const badge: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, color: "#fff", padding: "2px 6px", borderRadius: 5, letterSpacing: 0.3, flexShrink: 0, marginTop: 1 };
