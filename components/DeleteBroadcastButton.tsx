"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Trash button for a broadcast row in the audit table. Deletes the record
 *  (server-side, service-role) then refreshes the list. */
export function DeleteBroadcastButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onDelete = async () => {
    if (busy) return;
    if (!window.confirm(`Delete broadcast ${label}? This permanently removes the record.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/broadcast?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        return;
      }
    } catch {
      /* fall through to re-enable */
    }
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      aria-label="Delete broadcast"
      title="Delete broadcast"
      style={{
        display: "grid",
        placeItems: "center",
        width: 28,
        height: 28,
        borderRadius: 7,
        border: "1px solid var(--orca-line)",
        background: "#fff",
        color: busy ? "#cbd5e1" : "#dc2626",
        cursor: busy ? "default" : "pointer",
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
    </button>
  );
}
