"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { reveal } from "@/lib/motion";
import type { Finding } from "@/lib/types";
import { OFFICIAL_CHANNELS, channelForAgency, faviconUrl, type Channel } from "@/lib/channels";
import { SnapshotModal } from "./SnapshotModal";
import { SourceItemsModal } from "./SourceItemsModal";

// Verified-lane uses a single accent — selected tiles all light up the same
// navy regardless of which channel, per design.
const ACCENT = "#002C77";

export function Findings({
  findings,
  selected,
  onToggle,
}: {
  findings: Finding[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [snapshotOf, setSnapshotOf] = useState<Finding | null>(null);
  const [inspectChannel, setInspectChannel] = useState<Channel | null>(null);

  // Always render every official channel — empty containers are still
  // selectable / inspectable; they just won't have items inside.
  const byChannel = useMemo(() => {
    const map = new Map<string, Finding[]>();
    for (const f of findings) {
      const ch = channelForAgency(f.agency);
      if (!ch) continue;
      const arr = map.get(ch.id) ?? [];
      arr.push(f);
      map.set(ch.id, arr);
    }
    return map;
  }, [findings]);

  return (
    <>
      <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {OFFICIAL_CHANNELS.map((channel) => (
          <SourceTile
            key={channel.id}
            channel={channel}
            items={byChannel.get(channel.id) ?? []}
            isSelected={selected.has(channel.id)}
            onToggle={() => onToggle(channel.id)}
            onInspect={() => setInspectChannel(channel)}
            accent={ACCENT}
          />
        ))}
      </div>

      <SourceItemsModal
        open={!!inspectChannel}
        channel={inspectChannel}
        accent={ACCENT}
        findings={inspectChannel ? (byChannel.get(inspectChannel.id) ?? []) : []}
        onSnapshot={(item) => setSnapshotOf(item as Finding)}
        onClose={() => setInspectChannel(null)}
      />

      <SnapshotModal
        open={!!snapshotOf}
        runId={snapshotOf?.tinyfishRunId}
        stepId={snapshotOf?.tinyfishStepId}
        sourceName={snapshotOf?.agency ?? ""}
        sourceUrl={snapshotOf?.url}
        itemText={snapshotOf?.text ?? ""}
        onClose={() => setSnapshotOf(null)}
      />
    </>
  );
}

function SourceTile({
  channel,
  items,
  isSelected,
  onToggle,
  onInspect,
  accent,
}: {
  channel: Channel;
  items: Finding[];
  isSelected: boolean;
  onToggle: () => void;
  onInspect: () => void;
  accent: string;
}) {
  const hasData = items.length > 0;

  return (
    <motion.section
      layout
      {...reveal}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); }
      }}
      style={{
        background: isSelected ? `${accent}10` : "#fff",
        border: `1.5px solid ${isSelected ? accent : "var(--cara-line)"}`,
        borderRadius: 12,
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: isSelected ? `0 4px 14px -6px ${accent}55` : "none",
        opacity: hasData ? 1 : 0.7,
        transition: "border-color .15s, box-shadow .15s, opacity .15s, background .15s",
        outline: "none",
      }}
    >
      <div style={{ position: "relative", padding: "16px 12px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); if (hasData) onInspect(); }}
          disabled={!hasData}
          aria-label="View stored info"
          title={hasData ? "Open the source's stored info" : "No info stored yet"}
          style={{
            position: "absolute", top: 8, right: 8,
            display: "grid", placeItems: "center",
            width: 22, height: 22, borderRadius: "50%",
            border: `1px solid ${hasData ? accent : "var(--cara-line)"}`,
            background: "#fff",
            color: hasData ? accent : "#cbd5e1",
            cursor: hasData ? "pointer" : "not-allowed",
            fontSize: 11, fontWeight: 800, fontStyle: "italic",
            fontFamily: "Georgia, 'Times New Roman', serif", lineHeight: 1,
          }}
        >
          i
        </button>
        <img
          src={channel.logoUrl ?? faviconUrl(channel.domain, 128)}
          alt=""
          width={36}
          height={36}
          style={{ borderRadius: 8 }}
        />
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--cara-ink)", textAlign: "center" }}>
          {channel.name}
        </div>
        {hasData && (
          <div style={{ fontSize: 10, color: "var(--cara-muted)", fontWeight: 600 }}>
            {items.length} finding{items.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </motion.section>
  );
}
