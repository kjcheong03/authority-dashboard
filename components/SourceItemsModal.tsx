"use client";

/* ───────────────────────────────────────────────────────────────────────────
 * SourceItemsModal — opens when an officer clicks the (i) button on a source
 * tile. Shows every finding / claim that came from that source for the
 * current run, in a large dedicated viewer. Each row has its own
 * 'View source ↗' link that opens the actual URL the agent extracted from.
 * ─────────────────────────────────────────────────────────────────────────── */

import type { Finding, Claim } from "@/lib/types";
import { faviconUrl, type Channel } from "@/lib/channels";

type Item =
  | { kind: "finding"; finding: Finding }
  | { kind: "claim";   claim: Claim };

export function SourceItemsModal({
  open,
  channel,
  accent,
  findings,
  claims,
  onClose,
}: {
  open: boolean;
  channel: Channel | null;
  accent: string;
  // Pass in whichever list this source contributes to (always one of the two).
  findings?: Finding[];
  claims?: Claim[];
  onClose: () => void;
}) {
  if (!open || !channel) return null;

  const items: Item[] = findings
    ? findings.map((f) => ({ kind: "finding" as const, finding: f }))
    : (claims ?? []).map((c) => ({ kind: "claim" as const, claim: c }));

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
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
          width: "min(900px, 95vw)",
          height: "min(80vh, 800px)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px -16px rgba(15,39,71,0.5)",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--orca-line)", background: `${accent}08` }}>
          <img
            src={channel.logoUrl ?? faviconUrl(channel.domain, 128)}
            alt=""
            width={32}
            height={32}
            style={{ borderRadius: 7, flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "var(--orca-muted)" }}>STORED INFO</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--orca-ink)" }}>{channel.name}</div>
            <div style={{ fontSize: 11, color: "var(--orca-muted)", marginTop: 1 }}>
              {items.length} {findings ? "finding" : "claim"}{items.length === 1 ? "" : "s"} captured from this source
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}>×</button>
        </div>

        {/* body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          {items.length === 0 ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--orca-muted)", fontSize: 13 }}>
              This source returned no items in the current run. It may have been blocked, rate-limited, or simply had nothing matching the topic.
            </div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              {items.map((it, i) => (
                <li key={i}>
                  {it.kind === "finding" ? (
                    <FindingRow f={it.finding} accent={accent} />
                  ) : (
                    <ClaimRow c={it.claim} accent={accent} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function FindingRow({ f, accent }: { f: Finding; accent: string }) {
  // Prefer the agent-extracted sourceUrl, fall back to the legacy url field.
  const href = f.sourceUrl ?? f.url;
  return (
    <div style={rowCard}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          {f.stat && (
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
              padding: "2px 7px", borderRadius: 4,
              background: `${accent}18`, color: accent,
            }}>
              {f.stat}
            </span>
          )}
          {f.timeAgo && <span style={{ fontSize: 10, color: "var(--orca-muted)" }}>{f.timeAgo}</span>}
        </div>
        <div style={{ fontSize: 13.5, color: "var(--orca-ink)", lineHeight: 1.5 }}>{f.text}</div>
        {f.url && (
          <div style={{ marginTop: 5 }}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: accent, textDecoration: "underline", fontWeight: 600 }}>
              View source ↗
            </a>
          </div>
        )}
      </div>
      <SourceLinkBtn href={href} accent={accent} />
    </div>
  );
}

function ClaimRow({ c, accent }: { c: Claim; accent: string }) {
  const danger = c.severity === "UNVERIFIED";
  return (
    <div style={{ ...rowCard, background: danger ? "#fef2f2" : "#fff" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4, color: "#fff",
            padding: "2px 7px", borderRadius: 4,
            background: danger ? "var(--orca-red)" : "#64748b",
          }}>
            {danger ? "UNVERIFIED" : "DISCREPANCY"}
          </span>
          {c.shares && <span style={{ fontSize: 10, color: "var(--orca-muted)" }}>{c.shares}</span>}
        </div>
        <div style={{ fontSize: 13.5, color: danger ? "#991b1b" : "#334155", lineHeight: 1.5 }}>
          “{c.text}”
        </div>
        {c.analysis && (
          <div style={{ marginTop: 6, fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
            <strong style={{ color: "#334155" }}>Why it&apos;s false:</strong> {c.analysis}
          </div>
        )}
        {c.fix && (
          <div style={{ marginTop: 6, padding: "7px 9px", background: "#ecfdf5", borderRadius: 7, fontSize: 12, color: "#065f46", lineHeight: 1.45 }}>
            <strong>Suggested clarification:</strong> {c.fix}
          </div>
        )}
      </div>
      <SourceLinkBtn href={c.sourceUrl} accent={accent} />
    </div>
  );
}

function SourceLinkBtn({ href, accent }: { href: string | undefined; accent: string }) {
  const disabled = !href;
  const baseStyle: React.CSSProperties = {
    flexShrink: 0,
    width: 30, height: 30, borderRadius: 8,
    display: "grid", placeItems: "center",
    border: "1px solid var(--orca-line)", background: "#fff",
    color: disabled ? "#cbd5e1" : accent,
    cursor: disabled ? "not-allowed" : "pointer",
    textDecoration: "none",
  };
  const icon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
  if (disabled) {
    return (
      <span
        title="No source URL"
        aria-label="No source URL"
        aria-disabled="true"
        style={baseStyle}
      >
        {icon}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Open source URL in a new tab"
      aria-label="View source"
      style={baseStyle}
    >
      {icon}
    </a>
  );
}

const rowCard: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 12,
  padding: "11px 13px",
  background: "#fff",
  border: "1px solid var(--orca-line)",
  borderRadius: 10,
};

const closeBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: "1px solid var(--orca-line)",
  background: "#fff", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--orca-muted)",
};
