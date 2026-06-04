"use client";

/* ───────────────────────────────────────────────────────────────────────────
 * SourcePickerModal — opens from DraftPanel, lets the officer pick which
 * verified sources (for facts) and online sources (for misinformation context)
 * the broadcast draft should be regenerated from.
 *
 * Each source is shown with its real logo + the count of findings/claims it
 * contributed, so the choice is grounded in what the agent actually collected.
 * ─────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { faviconUrl, channelForAgency, channelForWhere, type Channel } from "@/lib/channels";
import type { Finding, Claim } from "@/lib/types";

interface SourceTally {
  channel: Channel;
  count: number;
}

export function SourcePickerModal({
  open,
  runId,
  findings,
  claims,
  onClose,
  onApplied,
}: {
  open: boolean;
  runId: string | null;
  findings: Finding[];
  claims: Claim[];
  onClose: () => void;
  onApplied: () => void;
}) {
  // Tally how many findings/claims each channel contributed (only channels with > 0).
  const officialTallies = useMemo<SourceTally[]>(() => {
    const counts = new Map<string, { channel: Channel; count: number }>();
    for (const f of findings) {
      const ch = channelForAgency(f.agency);
      if (!ch) continue;
      const e = counts.get(ch.id) ?? { channel: ch, count: 0 };
      e.count++;
      counts.set(ch.id, e);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [findings]);

  const socialTallies = useMemo<SourceTally[]>(() => {
    const counts = new Map<string, { channel: Channel; count: number }>();
    for (const c of claims) {
      const ch = channelForWhere(c.where);
      if (!ch) continue;
      const e = counts.get(ch.id) ?? { channel: ch, count: 0 };
      e.count++;
      counts.set(ch.id, e);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [claims]);

  // Default selection = everything that produced data.
  const [selectedOfficial, setSelectedOfficial] = useState<Set<string>>(new Set());
  const [selectedSocial, setSelectedSocial] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedOfficial(new Set(officialTallies.map((t) => t.channel.id)));
    setSelectedSocial(new Set(socialTallies.map((t) => t.channel.id)));
    setError(null);
  }, [open, officialTallies, socialTallies]);

  if (!open) return null;

  const factCount = findings.filter((f) => {
    const ch = channelForAgency(f.agency);
    return ch && selectedOfficial.has(ch.id);
  }).length;
  const claimCount = claims.filter((c) => {
    const ch = channelForWhere(c.where);
    return ch && selectedSocial.has(ch.id);
  }).length;

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  const apply = async () => {
    if (!runId) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          officialChannels: [...selectedOfficial],
          socialChannels: [...selectedSocial],
        }),
      });
      if (!res.ok) throw new Error(`Regenerate failed: ${res.status}`);
      onApplied();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(15,39,71,0.45)",
        display: "grid", placeItems: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14, width: "100%", maxWidth: 580,
          maxHeight: "calc(100vh - 80px)", overflow: "auto",
          boxShadow: "0 24px 60px -16px rgba(15,39,71,0.45)",
        }}
      >
        {/* header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--cara-line)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--cara-ink)" }}>Pick sources for broadcast</div>
            <div style={{ fontSize: 12, color: "var(--cara-muted)", marginTop: 2 }}>
              The draft will be regenerated using only the selected sources' content.
            </div>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Close">×</button>
        </div>

        {/* body */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          <Section
            label="Verified Sources · facts"
            accent="#002C77"
            tallies={officialTallies}
            selected={selectedOfficial}
            onToggle={(id) => toggle(selectedOfficial, setSelectedOfficial, id)}
            emptyText="No verified sources contributed findings yet."
            unit="fact"
            getJson={(channelId) =>
              findings.filter((f) => channelForAgency(f.agency)?.id === channelId)
            }
          />
          <Section
            label="Online Sources · misinformation"
            accent="#b45309"
            tallies={socialTallies}
            selected={selectedSocial}
            onToggle={(id) => toggle(selectedSocial, setSelectedSocial, id)}
            emptyText="No online sources contributed claims yet."
            unit="claim"
            getJson={(channelId) =>
              claims.filter((c) => channelForWhere(c.where)?.id === channelId)
            }
          />
        </div>

        {/* footer */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--cara-line)", background: "#fbfdfc", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, fontSize: 12, color: "var(--cara-muted)", fontWeight: 600 }}>
            Selected: <strong style={{ color: "var(--cara-ink)" }}>{factCount}</strong> facts ·{" "}
            <strong style={{ color: "var(--cara-ink)" }}>{claimCount}</strong> claims
          </div>
          {error && <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>{error}</div>}
          <button onClick={onClose} style={btnGhost} disabled={applying}>Cancel</button>
          <button onClick={apply} style={btnPrimary} disabled={applying || !runId}>
            {applying ? "Regenerating…" : "Apply to broadcast"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  label, accent, tallies, selected, onToggle, emptyText, unit, getJson,
}: {
  label: string;
  accent: string;
  tallies: SourceTally[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyText: string;
  unit: string;
  getJson: (channelId: string) => unknown[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4, color: accent, marginBottom: 8 }}>
        {label.toUpperCase()}
      </div>
      {tallies.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--cara-muted)", padding: "10px 0" }}>{emptyText}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tallies.map(({ channel, count }) => {
            const isSelected = selected.has(channel.id);
            const isExpanded = expanded.has(channel.id);
            return (
              <div key={channel.id} style={{ display: "flex", flexDirection: "column" }}>
                <div
                  onClick={() => onToggle(channel.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", borderRadius: isExpanded ? "10px 10px 0 0" : 10, cursor: "pointer",
                    border: `1.5px solid ${isSelected ? accent : "var(--cara-line)"}`,
                    borderBottom: isExpanded ? `1.5px solid ${accent}` : `1.5px solid ${isSelected ? accent : "var(--cara-line)"}`,
                    background: isSelected ? `${accent}10` : "#fff",
                    textAlign: "left", fontFamily: "inherit",
                    transition: "border-color .15s, background .15s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    readOnly
                    style={{ accentColor: accent, width: 15, height: 15, cursor: "pointer", flexShrink: 0 }}
                  />
                  <img
                    src={channel.logoUrl ?? faviconUrl(channel.domain)}
                    alt=""
                    width={18}
                    height={18}
                    style={{ borderRadius: 4, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--cara-ink)", flex: 1 }}>
                    {channel.name}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--cara-muted)", fontWeight: 600 }}>
                    {count} {unit}{count === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(channel.id); }}
                    title={isExpanded ? "Hide structured data" : "Show structured data"}
                    aria-label={isExpanded ? "Hide structured data" : "Show structured data"}
                    style={{
                      display: "grid", placeItems: "center",
                      width: 22, height: 22, borderRadius: "50%",
                      border: `1px solid ${isExpanded ? accent : "var(--cara-line)"}`,
                      background: isExpanded ? accent : "#fff",
                      color: isExpanded ? "#fff" : accent,
                      cursor: "pointer", fontSize: 11, fontWeight: 800, fontStyle: "italic",
                      fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    i
                  </button>
                </div>
                {isExpanded && (
                  <pre
                    style={{
                      margin: 0,
                      padding: "10px 12px",
                      maxHeight: 200,
                      overflow: "auto",
                      fontSize: 10.5,
                      lineHeight: 1.5,
                      fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
                      color: "#334155",
                      background: "#0c1424",
                      borderRadius: "0 0 10px 10px",
                      border: `1.5px solid ${isSelected ? accent : "var(--cara-line)"}`,
                      borderTop: 0,
                    }}
                  >
                    <code style={{ color: "#e0e7ff", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {JSON.stringify(getJson(channel.id), null, 2)}
                    </code>
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const closeBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, border: "1px solid var(--cara-line)",
  background: "#fff", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--cara-muted)",
};
const btnGhost: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 700, color: "var(--cara-ink)", background: "#fff",
  border: "1px solid var(--cara-line)", padding: "8px 14px", borderRadius: 8, cursor: "pointer",
};
const btnPrimary: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 700, color: "#fff", background: "#002C77",
  border: 0, padding: "9px 16px", borderRadius: 8, cursor: "pointer",
};
