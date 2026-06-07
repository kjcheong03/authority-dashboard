"use client";

/* ───────────────────────────────────────────────────────────────────────────
 * SnapshotModal — opens from a finding or claim row, shows the TinyFish
 * screenshot (default) + HTML toggle of the exact page the agent extracted
 * from. Drives the [📸] forensic evidence layer.
 * ─────────────────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";

export function SnapshotModal({
  open,
  runId,
  stepId,
  sourceName,
  sourceUrl,
  itemText,
  onClose,
}: {
  open: boolean;
  runId: string | null | undefined;
  stepId: string | null | undefined;
  sourceName: string;
  sourceUrl?: string;
  itemText: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<"screenshot" | "html">("screenshot");
  const [imgFailed, setImgFailed] = useState(false);

  // Reset the image-failed flag whenever the modal opens on a new step.
  useEffect(() => {
    if (open) setImgFailed(false);
  }, [open, runId, stepId]);

  if (!open) return null;

  const ready = !!runId && !!stepId;
  const ssUrl = ready ? `/api/tinyfish/screenshot?runId=${encodeURIComponent(runId!)}&stepId=${encodeURIComponent(stepId!)}` : null;
  const htmlUrl = ready ? `/api/tinyfish/html?runId=${encodeURIComponent(runId!)}&stepId=${encodeURIComponent(stepId!)}` : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 120,
        background: "rgba(15,39,71,0.6)",
        display: "grid", placeItems: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14,
          // Fixed large size — never collapses to content. Always feels like a
          // proper viewer, not a squeezed sliver.
          width: "min(1200px, 95vw)",
          height: "min(85vh, 900px)",
          display: "flex", flexDirection: "column",
          boxShadow: "0 24px 60px -16px rgba(15,39,71,0.5)",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid var(--orca-line)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "var(--orca-muted)" }}>SOURCE SNAPSHOT</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--orca-ink)", marginTop: 2 }}>{sourceName}</div>
            <div style={{ fontSize: 11.5, color: "#334155", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{itemText}</div>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10.5, color: "#002C77", fontWeight: 600, textDecoration: "underline" }}>
                {sourceUrl}
              </a>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, padding: 3, background: "#f1f5f9", borderRadius: 8, flexShrink: 0 }}>
            <Toggle active={view === "screenshot"} onClick={() => setView("screenshot")}>Screenshot</Toggle>
            <Toggle active={view === "html"} onClick={() => setView("html")}>HTML</Toggle>
          </div>
          <button onClick={onClose} aria-label="Close" style={closeBtn}>×</button>
        </div>

        {/* body — always fills the fixed modal height */}
        <div style={{ flex: 1, minHeight: 0, background: "#0c1424", display: "grid", placeItems: "center", overflow: "auto", position: "relative" }}>
          {!ready ? (
            <FallbackMsg
              title="No snapshot recorded"
              body="This item was extracted before snapshot capture was enabled. Re-run research on a fresh topic to populate snapshots."
            />
          ) : view === "screenshot" ? (
            imgFailed ? (
              <FallbackMsg
                title="Screenshot unavailable"
                body={`TinyFish didn't return a screenshot for this step — the capture flag may not have been honored, or the step expired.${sourceUrl ? " You can still open the source URL from the header above." : ""}`}
              />
            ) : (
              <img
                src={ssUrl!}
                alt={`Snapshot from ${sourceName}`}
                onError={() => setImgFailed(true)}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", background: "#fff" }}
              />
            )
          ) : (
            <iframe
              src={htmlUrl!}
              title={`HTML snapshot from ${sourceName}`}
              sandbox=""
              style={{ width: "100%", height: "100%", border: 0, background: "#fff" }}
            />
          )}
        </div>

        {/* footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderTop: "1px solid var(--orca-line)", fontSize: 10.5, color: "var(--orca-muted)", fontWeight: 600 }}>
          <span>via TinyFish session</span>
          {runId && <code style={{ fontSize: 10, color: "var(--orca-ink)" }}>{runId.slice(0, 8)}…</code>}
          {stepId && <code style={{ fontSize: 10, color: "var(--orca-ink)" }}>step {stepId.slice(0, 8)}…</code>}
        </div>
      </div>
    </div>
  );
}

function FallbackMsg({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ maxWidth: 480, padding: 32, textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#e0e7ff" }}>{title}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "#94a3b8" }}>{body}</div>
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11.5, fontWeight: 700, padding: "5px 11px", borderRadius: 6, border: 0, cursor: "pointer",
        background: active ? "#fff" : "transparent", color: active ? "#002C77" : "var(--orca-muted)",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

const closeBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, border: "1px solid var(--orca-line)",
  background: "#fff", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--orca-muted)",
};
