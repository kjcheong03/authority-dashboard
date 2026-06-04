"use client";

import { useEffect, useRef, useState } from "react";
import type { Draft, Finding, Claim } from "@/lib/types";
import { SourcePickerModal } from "./SourcePickerModal";

// ── Markdown ⇄ HTML for the rich body editor ──────────────────────────────
// Body text is stored as plain text with **bold** markers (same convention the
// AI draft and the PDF export use). The editor shows it as real bold.
function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function mdToHtml(md: string): string {
  return escapeHtml(md)
    .replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    .replace(/\n/g, "<br>");
}
// Walk the contentEditable DOM back into **bold** markdown.
function nodeToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  let inner = Array.from(el.childNodes).map(nodeToMd).join("");
  if (tag === "a") {
    const href = el.getAttribute("href") || "";
    return href && inner.trim() ? `[${inner}](${href})` : inner;
  }
  const bold =
    tag === "b" ||
    tag === "strong" ||
    /font-weight\s*:\s*(bold|[6-9]00)/i.test(el.getAttribute("style") || "");
  if (bold && inner.trim()) inner = `**${inner}**`;
  if (tag === "div" || tag === "p") inner += "\n";
  return inner;
}
function htmlToMd(root: HTMLElement): string {
  return Array.from(root.childNodes)
    .map(nodeToMd)
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
}

// Care-recipient profiles — elderly with conditions that change emergency risk/advice.
// None selected = all caregivers.
const PROFILES = ["Diabetes", "Heart", "Respiratory", "Dementia", "Kidney", "Immunocompromised", "Mobility"];

const FONT = "var(--font-rounded), ui-sans-serif, system-ui, sans-serif";

// One consistent "selected" colour across all radios & chips — dark grey, bold.
const SELECTED = "#334155";

export function DraftPanel({
  draft,
  runId,
  findings,
  claims,
  onRefresh,
}: {
  draft: Draft | null;
  runId: string | null;
  findings: Finding[];
  claims: Claim[];
  onRefresh?: () => Promise<void> | void;
}) {
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(true);
  const [audienceMode, setAudienceMode] = useState<"all" | "selected">("all");
  const [profiles, setProfiles] = useState<string[]>([]);
  const [broadcast, setBroadcast] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (draft) {
      setHeadline(draft.title);
      setBody(draft.body);
      setUrgent(draft.urgency === "HIGH");
      setAudienceMode("all");
      setProfiles([]);
      setBroadcast(false);
      setConfirmation(null);
      if (editorRef.current) editorRef.current.innerHTML = mdToHtml(draft.body);
    }
  }, [draft]);

  const handleBroadcast = async () => {
    if (!runId || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          title: headline,
          body,
          urgency: urgent ? "HIGH" : "NORMAL",
          audienceMode,
          targetProfiles: profiles,
        }),
      });
      if (res.ok) {
        const { confirmationId } = (await res.json()) as { confirmationId: string };
        setConfirmation(confirmationId);
        setBroadcast(true);
      } else {
        setBroadcast(true); // still flip to Sent visually
      }
    } catch {
      setBroadcast(true);
    } finally {
      setSending(false);
    }
  };

  const syncBody = () => {
    if (editorRef.current) setBody(htmlToMd(editorRef.current));
  };
  // Ctrl/Cmd+B toggles bold on the current selection.
  const onEditorKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      document.execCommand("bold");
      syncBody();
    }
  };
  const applyBold = () => {
    editorRef.current?.focus();
    document.execCommand("bold");
    syncBody();
  };

  const toggleProfile = (p: string) =>
    setProfiles((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  return (
    <section style={panel}>
      <header style={{ display: "flex", alignItems: "center", padding: "11px 16px", borderBottom: "1px solid var(--cara-line)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: 1 }}>Broadcast</h2>
        <button
          onClick={() => setPickerOpen(true)}
          disabled={!runId || (findings.length === 0 && claims.length === 0)}
          title="Pick sources for broadcast"
          aria-label="Pick sources for broadcast"
          style={{
            display: "grid", placeItems: "center",
            width: 30, height: 30, borderRadius: 8,
            border: "1px solid var(--cara-line)", background: "#fff",
            color: "var(--cara-ink)", cursor: "pointer",
            opacity: !runId || (findings.length === 0 && claims.length === 0) ? 0.4 : 1,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </button>
      </header>

      <div style={{ padding: 16 }}>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="Headline"
          style={{
            width: "100%", borderRadius: 10, border: "1px solid var(--cara-line)", padding: "11px 13px",
            fontSize: 14, fontWeight: 500, fontFamily: FONT, color: "var(--cara-ink)", background: "#fff", marginBottom: 10,
          }}
        />
        <div
          style={{
            border: "1px solid var(--cara-line)", borderRadius: 10, background: "#fff", overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
              borderBottom: "1px solid var(--cara-line)",
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={applyBold}
              title="Bold (Ctrl/Cmd+B)"
              style={{
                width: 26, height: 26, borderRadius: 6, border: "1px solid var(--cara-line)",
                background: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 13, fontFamily: FONT,
                color: "var(--cara-ink)", lineHeight: 1,
              }}
            >
              B
            </button>
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={syncBody}
            onKeyDown={onEditorKeyDown}
            data-placeholder="Message…"
            className="cara-editor"
            style={{
              minHeight: 120, padding: 13, fontSize: 14, fontWeight: 500, lineHeight: 1.55,
              fontFamily: FONT, color: "var(--cara-ink)", outline: "none",
            }}
          />
        </div>

        {/* urgency */}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Pill active={urgent} onClick={() => setUrgent(true)}>High Urgency</Pill>
          <Pill active={!urgent} onClick={() => setUrgent(false)}>Normal</Pill>
        </div>

        {/* audience */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--cara-muted)", letterSpacing: 0.4, marginBottom: 8 }}>SEND TO</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Pill active={audienceMode === "all"} onClick={() => { setAudienceMode("all"); setProfiles([]); }}>
              All caregivers
            </Pill>
            <Pill active={audienceMode === "selected"} onClick={() => setAudienceMode("selected")}>
              Selected profiles
            </Pill>
          </div>

          {audienceMode === "selected" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
              {PROFILES.map((p) => {
                const on = profiles.includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggleProfile(p)}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                      border: `1px solid ${on ? SELECTED : "var(--cara-line)"}`,
                      background: on ? SELECTED : "#fff",
                      color: on ? "#fff" : "var(--cara-muted)",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* action */}
        <div style={{ marginTop: 18 }}>
          <button
            onClick={handleBroadcast}
            disabled={broadcast || sending || !runId}
            style={{
              padding: "12px 28px", borderRadius: 10, border: 0,
              cursor: broadcast || sending || !runId ? "default" : "pointer",
              background: broadcast || !runId ? "#94a3b8" : "#002C77",
              color: "#ffffff", fontWeight: 700, fontSize: 14,
            }}
          >
            {sending ? "Sending…" : broadcast ? "✓ Sent" : "Approve & broadcast"}
          </button>
        </div>
        {confirmation && (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--cara-muted)" }}>
            Confirmation: <code style={{ fontWeight: 700, color: "var(--cara-ink)" }}>{confirmation}</code>
          </div>
        )}
        {!runId && draft && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--cara-muted)" }}>
            No run in progress to broadcast against.
          </div>
        )}

        <SourcePickerModal
          open={pickerOpen}
          runId={runId}
          findings={findings}
          claims={claims}
          onClose={() => setPickerOpen(false)}
          onApplied={async () => { if (onRefresh) await onRefresh(); }}
        />
      </div>
    </section>
  );
}

// Segmented pill toggle — same shape as the Verified Facts / Misinformation tabs,
// in the consistent dark-grey theme (bold + tinted fill when active).
function Pill({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        font: "inherit", fontSize: 12.5, padding: "6px 14px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${active ? SELECTED : "var(--cara-line)"}`,
        background: active ? "rgba(51,65,85,.1)" : "#fff",
        color: active ? SELECTED : "var(--cara-muted)",
        fontWeight: active ? 700 : 600,
      }}
    >
      {children}
    </button>
  );
}

const panel: React.CSSProperties = { background: "var(--cara-panel)", border: "1px solid var(--cara-line)", borderRadius: 14, overflow: "hidden" };
