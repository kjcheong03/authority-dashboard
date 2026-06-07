"use client";

import { useEffect, useRef, useState } from "react";
import type { Draft, Finding, Claim } from "@/lib/types";

// ── Markdown ⇄ HTML for the rich body editor ──────────────────────────────
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

const PROFILES = ["Diabetes", "Heart", "Respiratory", "Dementia", "Kidney", "Immunocompromised", "Mobility"];

const FONT = "var(--font-rounded), ui-sans-serif, system-ui, sans-serif";
const SELECTED = "#334155";

// ORCA app languages — the broadcast is generated/sent in every one of these.
type Lang = "en" | "zh" | "ms" | "id" | "tl" | "my";
const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "tl", label: "Tagalog" },
  { code: "my", label: "မြန်မာ" },
];
const NON_EN = LANGS.filter((l) => l.code !== "en").map((l) => l.code);

type Translation = { title: string; body: string };

export interface DraftPanelHazardSnapshot {
  cases?: string | number;
  casesLabel?: string;
  trend?: string;
  hospitalisations?: string | number;
  hospitalisationsLabel?: string;
  icu?: string | number;
  asOf?: string;
  source?: string;
  gdelt?: { mentions30d?: string | number; velocity?: string };
}

async function translateOne(title: string, body: string, lang: string): Promise<Translation | null> {
  try {
    const r = await fetch("/api/draft/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, lang }),
    });
    return r.ok ? ((await r.json()) as Translation) : null;
  } catch {
    return null;
  }
}

export function DraftPanel({
  draft,
  runId,
  findings,
  claims,
  selectedOfficial,
  selectedSocial,
  hazardSnapshot,
  onRefresh,
}: {
  draft: Draft | null;
  runId: string | null;
  findings: Finding[];
  claims: Claim[];
  selectedOfficial: Set<string>;
  selectedSocial: Set<string>;
  hazardSnapshot?: DraftPanelHazardSnapshot | null;
  onRefresh?: () => Promise<void> | void;
}) {
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(true);
  const [audienceMode, setAudienceMode] = useState<"all" | "selected">("all");
  const [profiles, setProfiles] = useState<string[]>([]);
  const [broadcast, setBroadcast] = useState(false);
  const [sending, setSending] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  // English is the editable source; all other ORCA languages are pre-translated
  // (cached) so switching the dropdown is instant — never a per-switch spinner.
  const [lang, setLang] = useState<Lang>("en");
  const [translations, setTranslations] = useState<Record<string, Translation>>({});
  const [translating, setTranslating] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Translate the current English content into ALL ORCA languages, in parallel.
  // Returns the map so callers (approve) can use it without waiting for state.
  const translateAll = async (title: string, bodyText: string): Promise<Record<string, Translation>> => {
    if (!title && !bodyText) return {};
    setTranslating(true);
    try {
      const entries = await Promise.all(NON_EN.map(async (code) => [code, await translateOne(title, bodyText, code)] as const));
      const map: Record<string, Translation> = {};
      for (const [code, t] of entries) if (t) map[code] = t;
      setTranslations(map);
      return map;
    } finally {
      setTranslating(false);
    }
  };

  useEffect(() => {
    if (!draft) return;
    setHeadline(draft.title);
    setBody(draft.body);
    setUrgent(draft.urgency === "HIGH");
    setBroadcast(false);
    setConfirmation(null);
    setLang("en");
    setTranslations({});
    if (editorRef.current) editorRef.current.innerHTML = mdToHtml(draft.body);
    // Pre-generate every language up front so the dropdown is instant.
    void translateAll(draft.title, draft.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Restore the editable English body when switching back to English.
  useEffect(() => {
    if (lang === "en" && editorRef.current) {
      editorRef.current.innerHTML = mdToHtml(body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const busy = regenerating || translating;

  const handleRegenerate = async () => {
    if (!runId || busy) return;
    setRegenerating(true);
    try {
      await fetch("/api/draft/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          officialChannels: [...selectedOfficial],
          socialChannels: [...selectedSocial],
          hazardSnapshot: hazardSnapshot ?? undefined,
        }),
      });
      // onRefresh updates the `draft` prop, which triggers translateAll via the
      // effect above — so the spinner (busy = regenerating || translating) keeps
      // turning until every language is ready.
      if (onRefresh) await onRefresh();
    } finally {
      setRegenerating(false);
    }
  };

  const handleBroadcast = async () => {
    if (!runId || sending) return;
    setSending(true);
    try {
      // Ensure every language is translated before sending (e.g. after a manual edit).
      let tr = translations;
      if (Object.keys(tr).length < NON_EN.length) tr = await translateAll(headline, body);
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
          translations: tr,
        }),
      });
      if (res.ok) {
        const { confirmationId } = (await res.json()) as { confirmationId: string };
        setConfirmation(confirmationId);
        setBroadcast(true);
      } else {
        setBroadcast(true);
      }
    } catch {
      setBroadcast(true);
    } finally {
      setSending(false);
    }
  };

  const syncBody = () => {
    if (editorRef.current) setBody(htmlToMd(editorRef.current));
    // English changed → cached translations are stale; they're regenerated on
    // the next Regenerate, or just-in-time when Approve is pressed.
    setTranslations((prev) => (Object.keys(prev).length ? {} : prev));
  };
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

  const isEn = lang === "en";
  const preview = isEn ? null : translations[lang];
  // Fall back to the English content if a translation is missing (never blank).
  const headlineValue = isEn ? headline : preview?.title ?? headline;
  const previewBody = preview?.body ?? body;

  return (
    <section style={panel}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", borderBottom: "1px solid var(--orca-line)" }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: 1 }}>Broadcast</h2>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          disabled={busy}
          aria-label="Broadcast language"
          title="Preview / send language"
          style={{
            borderRadius: 8, border: "1px solid var(--orca-line)", padding: "6px 8px",
            fontSize: 12.5, fontFamily: FONT, color: "var(--orca-ink)", background: "#fff",
            cursor: busy ? "default" : "pointer", maxWidth: 160, opacity: busy ? 0.6 : 1,
          }}
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
        <button
          onClick={handleRegenerate}
          disabled={!runId || busy || (findings.length === 0 && claims.length === 0)}
          title="Regenerate draft + all language versions from selected sources"
          aria-label="Regenerate draft and all language versions"
          style={{
            display: "grid", placeItems: "center",
            width: 30, height: 30, borderRadius: 8,
            border: "1px solid var(--orca-line)", background: "#fff",
            color: "var(--orca-ink)", cursor: busy ? "default" : "pointer",
            opacity: !runId || busy || (findings.length === 0 && claims.length === 0) ? 0.45 : 1,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: busy ? "spin .8s linear infinite" : undefined }} aria-hidden="true">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </header>

      <div style={{ padding: 16 }}>
        {!isEn && (
          <div style={{ fontSize: 11, color: "var(--orca-muted)", marginBottom: 8, lineHeight: 1.5 }}>
            Auto-translated · sent to caregivers using this language in the ORCA app.
          </div>
        )}

        <input
          value={headlineValue}
          onChange={(e) => { if (isEn) setHeadline(e.target.value); }}
          readOnly={!isEn}
          placeholder="Headline"
          style={{
            width: "100%", borderRadius: 10, border: "1px solid var(--orca-line)", padding: "11px 13px",
            fontSize: 14, fontWeight: 500, fontFamily: FONT, color: "var(--orca-ink)",
            background: isEn ? "#fff" : "#f8fafc", marginBottom: 10,
          }}
        />
        <div style={{ border: "1px solid var(--orca-line)", borderRadius: 10, background: "#fff", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid var(--orca-line)" }}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={applyBold}
              disabled={!isEn}
              title="Bold (Ctrl/Cmd+B)"
              style={{
                width: 26, height: 26, borderRadius: 6, border: "1px solid var(--orca-line)",
                background: "#fff", cursor: isEn ? "pointer" : "default", fontWeight: 800, fontSize: 13, fontFamily: FONT,
                color: "var(--orca-ink)", lineHeight: 1, opacity: isEn ? 1 : 0.4,
              }}
            >
              B
            </button>
          </div>
          {isEn ? (
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncBody}
              onKeyDown={onEditorKeyDown}
              data-placeholder="Message…"
              className="orca-editor"
              style={{
                minHeight: 120, padding: 13, fontSize: 14, fontWeight: 500, lineHeight: 1.55,
                fontFamily: FONT, color: "var(--orca-ink)", outline: "none",
              }}
            />
          ) : (
            <div
              className="orca-editor"
              style={{
                minHeight: 120, padding: 13, fontSize: 14, fontWeight: 500, lineHeight: 1.55,
                fontFamily: FONT, color: "var(--orca-ink)", background: "#f8fafc",
              }}
              dangerouslySetInnerHTML={{ __html: mdToHtml(previewBody) }}
            />
          )}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Pill active={urgent} onClick={() => setUrgent(true)}>High Urgency</Pill>
          <Pill active={!urgent} onClick={() => setUrgent(false)}>Normal</Pill>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--orca-muted)", letterSpacing: 0.4, marginBottom: 8 }}>SEND TO</div>
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
                      border: `1px solid ${on ? SELECTED : "var(--orca-line)"}`,
                      background: on ? SELECTED : "#fff",
                      color: on ? "#fff" : "var(--orca-muted)",
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          )}
        </div>

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
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--orca-muted)" }}>
            Confirmation: <code style={{ fontWeight: 700, color: "var(--orca-ink)" }}>{confirmation}</code>
          </div>
        )}
        {!runId && draft && (
          <div style={{ marginTop: 8, fontSize: 11, color: "var(--orca-muted)" }}>
            No run in progress to broadcast against.
          </div>
        )}

      </div>
    </section>
  );
}

function Pill({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        font: "inherit", fontSize: 12.5, padding: "6px 14px", borderRadius: 999, cursor: "pointer",
        border: `1px solid ${active ? SELECTED : "var(--orca-line)"}`,
        background: active ? "rgba(51,65,85,.1)" : "#fff",
        color: active ? SELECTED : "var(--orca-muted)",
        fontWeight: active ? 700 : 600,
      }}
    >
      {children}
    </button>
  );
}

const panel: React.CSSProperties = { background: "var(--orca-panel)", border: "1px solid var(--orca-line)", borderRadius: 14, overflow: "hidden" };
