"use client";

/* ───────────────────────────────────────────────────────────────────────────
 * RegenerateAudienceModal — confirmation surface for "regenerate" actions
 * scoped either across all caregivers or against a chosen subset of
 * audience profiles. Seeded from the caller's current selection, the local
 * state is what gets returned via onConfirm.
 * ─────────────────────────────────────────────────────────────────────────── */

import type React from "react";
import { useState } from "react";

interface Props {
  open: boolean;
  initialMode: "all" | "selected";
  initialProfiles: string[];
  availableProfiles: string[];
  onClose: () => void;
  onConfirm: (mode: "all" | "selected", profiles: string[]) => void | Promise<void>;
}

export function RegenerateAudienceModal(p: Props): React.JSX.Element | null {
  const [mode, setMode] = useState<"all" | "selected">(p.initialMode);
  const [profiles, setProfiles] = useState<string[]>(p.initialProfiles);
  const [busy, setBusy] = useState(false);

  if (!p.open) return null;

  const toggleProfile = (name: string) => {
    setProfiles((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const confirmDisabled = busy || (mode === "selected" && profiles.length === 0);

  const handleConfirm = async () => {
    if (confirmDisabled) return;
    setBusy(true);
    try {
      await p.onConfirm(mode, mode === "all" ? [] : profiles);
      p.onClose();
    } finally {
      setBusy(false);
    }
  };

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
          width: "min(520px, 95vw)",
          padding: 20,
          boxShadow: "var(--orca-shadow-md)",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "var(--orca-muted)" }}>
              REGENERATE FOR…
            </div>
          </div>
          <button onClick={p.onClose} aria-label="Close" style={closeBtn}>×</button>
        </div>

        {/* body — radio choices */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <RadioRow
            active={mode === "all"}
            label="All caregivers"
            sub="Apply regeneration across every caregiver profile."
            onClick={() => setMode("all")}
          />
          <RadioRow
            active={mode === "selected"}
            label="Selected profiles"
            sub="Pick one or more audience profiles below."
            onClick={() => setMode("selected")}
          />

          {mode === "selected" && (
            <div
              style={{
                display: "flex", flexWrap: "wrap", gap: 8,
                padding: "10px 2px 2px",
              }}
            >
              {p.availableProfiles.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--orca-muted)" }}>
                  No audience profiles available.
                </div>
              ) : (
                p.availableProfiles.map((name) => {
                  const on = profiles.includes(name);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleProfile(name)}
                      style={{
                        fontSize: 12, fontWeight: 600,
                        padding: "6px 11px",
                        borderRadius: 999,
                        cursor: "pointer",
                        background: on ? "#002C77" : "#fff",
                        color: on ? "#fff" : "var(--orca-ink)",
                        border: on ? "1px solid #002C77" : "1px solid var(--orca-line)",
                        fontFamily: "inherit",
                      }}
                    >
                      {name}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button
            type="button"
            onClick={p.onClose}
            disabled={busy}
            style={{
              fontSize: 12.5, fontWeight: 600,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--orca-line)",
              background: "#fff",
              color: "var(--orca-ink)",
              cursor: busy ? "not-allowed" : "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            style={{
              fontSize: 12.5, fontWeight: 700,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #002C77",
              background: confirmDisabled ? "#94a3b8" : "#002C77",
              color: "#fff",
              cursor: confirmDisabled ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: confirmDisabled ? 0.7 : 1,
            }}
          >
            {busy ? "Working…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RadioRow({
  active,
  label,
  sub,
  onClick,
}: {
  active: boolean;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: "11px 13px",
        borderRadius: 10,
        cursor: "pointer",
        textAlign: "left",
        background: active ? "#f1f5fb" : "#fff",
        border: active ? "1px solid #002C77" : "1px solid var(--orca-line)",
        fontFamily: "inherit",
        width: "100%",
      }}
    >
      {/* faux radio dot */}
      <span
        aria-hidden
        style={{
          marginTop: 2,
          width: 16, height: 16, borderRadius: "50%",
          border: active ? "5px solid #002C77" : "1.5px solid var(--orca-line-strong)",
          background: "#fff",
          flexShrink: 0,
          boxSizing: "border-box",
        }}
      />
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--orca-ink)" }}>{label}</span>
        <span style={{ fontSize: 11.5, color: "var(--orca-muted)", lineHeight: 1.4 }}>{sub}</span>
      </span>
    </button>
  );
}

const closeBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, border: "1px solid var(--orca-line)",
  background: "#fff", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "var(--orca-muted)",
  fontFamily: "inherit",
};
