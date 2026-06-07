"use client";

/* ───────────────────────────────────────────────────────────────────────────
 * DraftHistoryModal — shows the history of caregiver advisory drafts for a
 * given run. Officers can click any entry to load it back into the composer.
 * ─────────────────────────────────────────────────────────────────────────── */

import type React from "react";
import { useEffect, useState } from "react";

export interface DraftHistoryEntry {
  id: string;
  title: string;
  body: string;
  target: string;
  urgency: "HIGH" | "NORMAL";
  audienceMode: "all" | "selected";
  profiles?: string[] | null;
  createdAt: string;
}

interface Props {
  open: boolean;
  runId: string | null;
  onClose: () => void;
  onSelect: (entry: DraftHistoryEntry) => void;
}

export function DraftHistoryModal(p: Props): React.JSX.Element | null {
  const [entries, setEntries] = useState<DraftHistoryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    if (!p.open || !p.runId) return;
    let cancelled = false;
    setLoading(true);
    setEntries([]);
    fetch(`/api/drafts/history?runId=${encodeURIComponent(p.runId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const list: DraftHistoryEntry[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.entries)
          ? data.entries
          : [];
        setEntries(list);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [p.open, p.runId]);

  if (!p.open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={p.onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 110,
        background: "rgba(15,39,71,0.55)",
        display: "grid", placeItems: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14,
          width: "min(720px, 95vw)",
          height: "min(80vh, 800px)",
          display: "flex", flexDirection: "column",
          boxShadow: "var(--orca-shadow-md)",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px",
          borderBottom: "1px solid var(--orca-line)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "var(--orca-muted)" }}>
              DRAFT HISTORY
            </div>
            <div style={{ fontSize: 11, color: "var(--orca-muted)", marginTop: 2 }}>
              {loading
                ? "Loading…"
                : `${entries.length} draft${entries.length === 1 ? "" : "s"} saved for this run`}
            </div>
          </div>
          <button onClick={p.onClose} aria-label="Close" style={closeBtn}>×</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--orca-muted)", fontSize: 13 }}>
              Loading draft history…
            </div>
          ) : entries.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--orca-muted)", fontSize: 13 }}>
              No drafts have been saved for this run yet.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {entries.map((entry) => {
                const isHover = hoverId === entry.id;
                const urgencyHigh = entry.urgency === "HIGH";
                const audienceLabel = entry.audienceMode === "all"
                  ? "All caregivers"
                  : `For: ${(entry.profiles ?? []).join(", ") || "—"}`;
                const snippet = (entry.body ?? "").slice(0, 150) + ((entry.body ?? "").length > 150 ? "…" : "");
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => { p.onSelect(entry); p.onClose(); }}
                      onMouseEnter={() => setHoverId(entry.id)}
                      onMouseLeave={() => setHoverId((cur) => (cur === entry.id ? null : cur))}
                      style={{
                        width: "100%", textAlign: "left",
                        display: "flex", flexDirection: "column", gap: 6,
                        padding: "12px 14px",
                        background: "#fff",
                        border: `1px solid ${isHover ? "var(--orca-line-strong)" : "var(--orca-line)"}`,
                        borderRadius: 10,
                        cursor: "pointer",
                        transition: "border-color 120ms ease",
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--orca-ink)", lineHeight: 1.35 }}>
                        {entry.title || "(untitled draft)"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{
                          fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: "#fff",
                          padding: "2px 7px", borderRadius: 4,
                          background: urgencyHigh ? "var(--orca-red)" : "#64748b",
                        }}>
                          {urgencyHigh ? "HIGH" : "NORMAL"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--orca-muted)" }}>
                          {audienceLabel}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--orca-muted)" }}>·</span>
                        <span style={{ fontSize: 11, color: "var(--orca-muted)" }}>
                          {relTime(entry.createdAt)}
                        </span>
                      </div>
                      {snippet && (
                        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
                          {snippet}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

const closeBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--orca-line)",
  background: "#fff", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--orca-muted)",
};
