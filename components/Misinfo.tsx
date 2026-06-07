"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { reveal } from "@/lib/motion";
import type { Claim, Spread } from "@/lib/types";
import { SOCIAL_CHANNELS, channelForWhere, faviconUrl, type Channel } from "@/lib/channels";
import { SnapshotModal } from "./SnapshotModal";
import { SourceItemsModal } from "./SourceItemsModal";

const ACCENT = "#b45309";

export function Misinfo({
  claims,
  selected,
  onToggle,
}: {
  claims: Claim[];
  spread: Spread | null;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [snapshotOf, setSnapshotOf] = useState<Claim | null>(null);
  const [inspectChannel, setInspectChannel] = useState<Channel | null>(null);

  const byChannel = useMemo(() => {
    const map = new Map<string, Claim[]>();
    for (const c of claims) {
      const ch = channelForWhere(c.where);
      if (!ch) continue;
      const arr = map.get(ch.id) ?? [];
      arr.push(c);
      map.set(ch.id, arr);
    }
    return map;
  }, [claims]);

  return (
    <>
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gridAutoRows: "96px", gap: 12, alignContent: "start", flex: 1, minHeight: 0, overflowY: "auto" }}>
        {SOCIAL_CHANNELS.map((channel) => (
          <SourceTile
            key={channel.id}
            channel={channel}
            items={byChannel.get(channel.id) ?? []}
            isSelected={selected.has(channel.id)}
            onToggle={() => onToggle(channel.id)}
            onInspect={() => setInspectChannel(channel)}
          />
        ))}
      </div>

      <SourceItemsModal
        open={!!inspectChannel}
        channel={inspectChannel}
        accent={ACCENT}
        claims={inspectChannel ? (byChannel.get(inspectChannel.id) ?? []) : []}
        onSnapshot={(item) => setSnapshotOf(item as Claim)}
        onClose={() => setInspectChannel(null)}
      />

      <SnapshotModal
        open={!!snapshotOf}
        runId={snapshotOf?.tinyfishRunId}
        stepId={snapshotOf?.tinyfishStepId}
        sourceName={snapshotOf?.where ?? "Source"}
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
}: {
  channel: Channel;
  items: Claim[];
  isSelected: boolean;
  onToggle: () => void;
  onInspect: () => void;
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
        background: isSelected ? `${ACCENT}0d` : "#fff",
        border: `1.5px solid ${isSelected ? ACCENT : "var(--orca-line)"}`,
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: isSelected
          ? `0 6px 18px -6px ${ACCENT}40, var(--orca-shadow-sm)`
          : "var(--orca-shadow-sm)",
        opacity: hasData ? 1 : 0.7,
        transition: "border-color .15s, box-shadow .15s, opacity .15s, background .15s",
        outline: "none",
      }}
    >
      <div style={{ position: "relative", padding: "12px 14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, height: "100%" }}>
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
            border: `1px solid ${hasData ? ACCENT : "var(--orca-line)"}`,
            background: "#fff",
            color: hasData ? ACCENT : "#cbd5e1",
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
        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--orca-ink)", textAlign: "center" }}>
          {channel.name}
        </div>
        {hasData && (
          <div style={{ fontSize: 11, color: "var(--orca-muted)", fontWeight: 600 }}>
            {items.length} claim{items.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
    </motion.section>
  );
}
