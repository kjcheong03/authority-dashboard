"use client";

/* ───────────────────────────────────────────────────────────────────────────
 * SurveillanceGrid — the live scan panel.
 *
 *   ✓ OFFICIAL SOURCES         (Phase 1 - ingest)
 *   [MOH][NEA][WHO][CDC][HHub][📊 data.gov.sg]
 *
 *   ⚠ SOCIAL & MEDIA           (Phase 2 - misinfo)
 *   [Reddit][HWZ][Mothership][TG][TikTok][FB][DDG][🌍 GDELT]
 *
 * Each tile = one source. Browser tiles host a TinyFish stream iframe; data
 * tiles render data viz (data.gov.sg clusters, GDELT velocity). Status
 * (idle / live / done) is derived from the run phase and the data already
 * collected, so the grid lights up correctly as findings/claims/spread land.
 * ─────────────────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CHANNELS, OFFICIAL_CHANNELS, SOCIAL_CHANNELS, faviconUrl, type Channel, type Lane } from "@/lib/channels";
import type { Phase, Spread, Finding, Claim } from "@/lib/types";

const NAVY = "#002C77";
const AMBER = "#b45309";
const GREEN_DOT = "#22c55e";
const DONE_GREY = "#94a3b8";
const IDLE_GREY = "#cbd5e1";
const RED = "#dc2626";

type Status = "idle" | "live" | "done" | "failed";

// ── Status derivation ────────────────────────────────────────────────
function statusFor(
  ch: Channel,
  phase: Phase,
  running: boolean,
  findings: Finding[],
  claims: Claim[],
  spread: Spread | null,
): Status {
  // Data tiles: live data presence drives status.
  if (ch.id === "gdelt") {
    if (spread) return "done";
    if (running && (phase === "misinfo" || phase === "ingest")) return "live";
    return "idle";
  }
  if (ch.id === "datagovsg") {
    if (findings.some((f) => f.agency === "NEA")) return "done";
    if (running && phase === "ingest") return "live";
    return "idle";
  }
  // Browser tiles in the official lane: active during ingest.
  if (ch.lane === "official") {
    if (phase === "ingest" && running) return "live";
    if (findings.length > 0 || phase === "misinfo" || phase === "draft" || phase === "done") return "done";
    return "idle";
  }
  // Browser tiles in the social lane: active during misinfo.
  if (phase === "misinfo" && running) return "live";
  if (claims.length > 0 || phase === "draft" || phase === "done") return "done";
  return "idle";
}

// ── Top-level grid ───────────────────────────────────────────────────
export function SurveillanceGrid({
  phase,
  running,
  streamingUrl,
  channelStreamingUrls,
  findings,
  claims,
  spread,
}: {
  phase: Phase;
  running: boolean;
  streamingUrl?: string;
  channelStreamingUrls?: Record<string, string>;
  findings: Finding[];
  claims: Claim[];
  spread: Spread | null;
}) {
  const statuses: Record<string, Status> = Object.fromEntries(
    CHANNELS.map((c) => [c.id, statusFor(c, phase, running, findings, claims, spread)]),
  );

  // While true parallel scraping isn't wired yet, the single TinyFish stream
  // lands in the first BROWSER tile of the currently-active lane. The user can
  // click any tile to move the focus there.
  const defaultFocusId =
    phase === "ingest"
      ? OFFICIAL_CHANNELS.find((c) => c.type === "browser")?.id
      : phase === "misinfo"
        ? SOCIAL_CHANNELS.find((c) => c.type === "browser")?.id
        : null;
  const [focusOverride, setFocusOverride] = useState<string | null>(null);
  const focusedId = focusOverride ?? defaultFocusId ?? null;

  const focusedChannel = CHANNELS.find((c) => c.id === focusedId) ?? null;
  const activeLane: Lane = focusedChannel?.lane ?? "official";
  const switchLane = (lane: Lane) => {
    const pool = lane === "official" ? OFFICIAL_CHANNELS : SOCIAL_CHANNELS;
    const firstBrowser = pool.find((c) => c.type === "browser");
    if (firstBrowser) setFocusOverride(firstBrowser.id);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <LanePill active={activeLane === "official"} onClick={() => switchLane("official")}>
          Verified Sources
        </LanePill>
        <LanePill
          active={activeLane === "social"}
          onClick={() => switchLane("social")}
          live={running && phase === "misinfo"}
        >
          Online Sources
        </LanePill>
      </div>

      <Featured
        channel={focusedChannel}
        status={focusedChannel ? statuses[focusedChannel.id] : "idle"}
        streamingUrl={
          // Prefer the per-channel stream URL (one TinyFish session per tile).
          // Fall back to the legacy single streamingUrl for back-compat.
          focusedChannel && channelStreamingUrls?.[focusedChannel.id]
            ? channelStreamingUrls[focusedChannel.id]
            : streamingUrl
        }
        findings={findings}
        claims={claims}
        spread={spread}
        running={running}
      />
      <div style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 10, padding: 8 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeLane}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            <Lane
              channels={activeLane === "official" ? OFFICIAL_CHANNELS : SOCIAL_CHANNELS}
              statuses={statuses}
              focusedId={focusedId}
              onFocus={setFocusOverride}
              findings={findings}
              spread={spread}
              claims={claims}
              channelStreamingUrls={channelStreamingUrls}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Featured area (large iframe / data viz of the focused channel) ───
function Featured({
  channel,
  status,
  streamingUrl,
  findings,
  spread,
  claims,
  running,
}: {
  channel: Channel | null;
  status: Status;
  streamingUrl?: string;
  findings: Finding[];
  spread: Spread | null;
  claims: Claim[];
  running: boolean;
}) {
  if (!channel) {
    return (
      <div style={featuredWrap}>
        <div style={{ aspectRatio: "16 / 9", background: "#fff", borderRadius: 10, border: "1px solid var(--cara-line)", display: "grid", placeItems: "center", color: "var(--cara-muted)", fontSize: 14, fontFamily: "ui-monospace,monospace" }}>
          ...
        </div>
      </div>
    );
  }

  const showIframe = channel.type === "browser" && status === "live" && !!streamingUrl;

  return (
    <div style={featuredWrap}>
      <div style={{ background: "#fff", borderRadius: 10, overflow: "hidden", border: `1px solid ${status === "live" ? NAVY : "var(--cara-line)"}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#eef2f7", borderBottom: "1px solid #eef2f0" }}>
          <img src={channel.logoUrl ?? faviconUrl(channel.domain)} alt="" width={16} height={16} style={{ borderRadius: 3 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--cara-ink)", letterSpacing: 0.2 }}>{channel.name}</span>
          <span style={{ fontSize: 10, color: "var(--cara-muted)", marginLeft: 4 }}>{channel.domain}</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--cara-muted)", fontWeight: 600 }}>
            <StatusDot status={status} />
            {status === "live" ? "LIVE" : status === "done" ? "complete" : status === "failed" ? "failed" : "idle"}
          </span>
        </div>
        <div style={{ aspectRatio: "16 / 9", background: showIframe ? "#06121f" : "#fff", position: "relative" }}>
          {channel.type === "data" ? (
            channel.id === "gdelt" ? (
              <FeaturedGdelt spread={spread} status={status} />
            ) : (
              <FeaturedDataGov findings={findings} status={status} />
            )
          ) : showIframe ? (
            <iframe
              src={streamingUrl}
              title={channel.name}
              style={{ width: "100%", height: "100%", border: 0, background: "#06121f" }}
              sandbox="allow-scripts allow-same-origin"
            />
          ) : status === "live" ? (
            <ScanningBody />
          ) : status === "done" ? (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--cara-muted)", fontSize: 13, fontFamily: "ui-monospace,monospace" }}>
              ✓ {channel.name} scan complete · {claims.length || findings.length} signals collected
            </div>
          ) : (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--cara-muted)", fontSize: 14, fontFamily: "ui-monospace,monospace" }}>
              ...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const featuredWrap: React.CSSProperties = {
  maxWidth: 600,
  margin: "0 auto",
  width: "100%",
};

function LanePill({
  active,
  onClick,
  disabled,
  live,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 12, fontWeight: active ? 700 : 600,
        padding: "6px 13px", borderRadius: 999,
        cursor: disabled ? "not-allowed" : "pointer",
        border: active ? "1px solid #002C77" : "1px solid var(--cara-line)",
        background: active ? "rgba(0,44,119,.1)" : "#fff",
        color: disabled ? "var(--cara-muted)" : active ? "#002C77" : "var(--cara-muted)",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {live && <span className="grid-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />}
      {children}
    </button>
  );
}

function FeaturedGdelt({ spread, status }: { spread: Spread | null; status: Status }) {
  if (!spread) {
    return <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--cara-muted)", fontSize: 13 }}>{status === "live" ? "querying BigQuery…" : "..."}</div>;
  }
  return (
    <div style={{ padding: 18, height: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <div style={{ fontSize: 38, fontWeight: 800, color: "var(--cara-ink)", lineHeight: 1 }}>
          {spread.totalArticles.toLocaleString()}
        </div>
        <div style={{ fontSize: 12, color: "var(--cara-muted)" }}>articles · last 24h</div>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <Stat label="Velocity" value={spread.velocityLabel} color={NAVY} />
        <Stat label="🇸🇬 Singapore" value={spread.singaporeArticles.toLocaleString()} />
        <Stat label="SG velocity" value={spread.singaporeVelocity} />
        {spread.toneLabel && <Stat label="Tone" value={spread.toneLabel} color={AMBER} />}
      </div>
      <div style={{ marginTop: "auto", fontSize: 10, color: "var(--cara-muted)" }}>
        from GDELT {spread.source === "bigquery" ? "(BigQuery)" : ""}
      </div>
    </div>
  );
}

function matchesDataGov(f: Finding): boolean {
  return (
    !!f.url?.includes("data.gov.sg") ||
    f.agency.toLowerCase().includes("data.gov") ||
    (f.agency === "NEA" && /cluster/i.test(f.text)) // legacy dengue-cluster fallback
  );
}

function FeaturedDataGov({ findings, status }: { findings: Finding[]; status: Status }) {
  const f = findings.find(matchesDataGov);
  if (!f) {
    return <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--cara-muted)", fontSize: 13 }}>{status === "live" ? "querying data.gov.sg…" : "..."}</div>;
  }
  return (
    <div style={{ padding: 18, height: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: "var(--cara-muted)", fontWeight: 700, letterSpacing: 0.3 }}>{f.agency.toUpperCase()} · data.gov.sg</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--cara-ink)", lineHeight: 1 }}>{f.stat ?? "live"}</div>
      <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.45 }}>{f.text}</div>
      <div style={{ marginTop: "auto", fontSize: 10, color: "var(--cara-muted)" }}>{f.timeAgo ?? ""} · via data.gov.sg</div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 9.5, color: "var(--cara-muted)", letterSpacing: 0.3, fontWeight: 600 }}>{label.toUpperCase()}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: color ?? "var(--cara-ink)" }}>{value}</span>
    </div>
  );
}

// ── Lane (one row of tiles) ──────────────────────────────────────────
function Lane({
  channels,
  statuses,
  focusedId,
  onFocus,
  findings,
  spread,
  claims,
  channelStreamingUrls,
}: {
  channels: Channel[];
  statuses: Record<string, Status>;
  focusedId: string | null;
  onFocus: (id: string) => void;
  findings: Finding[];
  spread: Spread | null;
  claims: Claim[];
  channelStreamingUrls?: Record<string, string>;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${channels.length}, minmax(0, 1fr))`, gap: 6 }}>
      {channels.map((ch) => (
        <Tile
          key={ch.id}
          channel={ch}
          status={statuses[ch.id]}
          focused={ch.id === focusedId}
          onFocus={() => onFocus(ch.id)}
          findings={findings}
          spread={spread}
          claims={claims}
          streamingUrl={channelStreamingUrls?.[ch.id]}
        />
      ))}
    </div>
  );
}

// ── One tile ─────────────────────────────────────────────────────────
function Tile({
  channel,
  status,
  focused,
  onFocus,
  findings,
  spread,
  claims,
  streamingUrl,
}: {
  channel: Channel;
  status: Status;
  focused: boolean;
  onFocus: () => void;
  findings: Finding[];
  spread: Spread | null;
  claims: Claim[];
  streamingUrl?: string;
}) {
  const border =
    status === "live"
      ? NAVY
      : status === "done"
        ? DONE_GREY
        : status === "failed"
          ? RED
          : "#e2e8f0";
  const isLive = status === "live";
  return (
    <button
      onClick={onFocus}
      title={channel.name}
      style={{
        all: "unset",
        cursor: "pointer",
        borderRadius: 8,
        border: `1.5px solid ${border}`,
        boxShadow: focused
          ? `0 0 0 2px ${NAVY}44`
          : isLive
            ? `0 0 0 2px ${NAVY}22`
            : "none",
        background: "#fff",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "border-color .25s ease, box-shadow .25s ease, transform .15s",
        transform: focused ? "translateY(-1px)" : "none",
      }}
    >
      <Header channel={channel} status={status} />
      <Body channel={channel} status={status} findings={findings} spread={spread} claims={claims} streamingUrl={streamingUrl} />
    </button>
  );
}

function Header({ channel, status }: { channel: Channel; status: Status }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 7px",
        borderBottom: "1px solid #eef2f0",
        background: "#eef2f7",
        minHeight: 26,
      }}
    >
      <img
        src={channel.logoUrl ?? faviconUrl(channel.domain)}
        alt=""
        width={14}
        height={14}
        style={{
          width: 14,
          height: 14,
          flexShrink: 0,
          borderRadius: 3,
          opacity: status === "idle" ? 0.45 : 1,
          filter: status === "done" ? "grayscale(.55)" : "none",
        }}
      />
      <span
        style={{
          flex: 1,
          fontSize: 10.5,
          fontWeight: 700,
          color: status === "idle" ? "var(--cara-muted)" : "var(--cara-ink)",
          letterSpacing: 0.1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {channel.name}
      </span>
      <StatusDot status={status} />
    </div>
  );
}

function StatusDot({ status }: { status: Status }) {
  const color =
    status === "live" ? GREEN_DOT : status === "done" ? DONE_GREY : status === "failed" ? RED : IDLE_GREY;
  return (
    <span
      className={status === "live" ? "grid-pulse" : undefined}
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        boxShadow: status === "live" ? `0 0 6px ${color}` : "none",
        flexShrink: 0,
      }}
    />
  );
}

function Body({
  channel,
  status,
  findings,
  spread,
  claims,
  streamingUrl,
}: {
  channel: Channel;
  status: Status;
  findings: Finding[];
  spread: Spread | null;
  claims: Claim[];
  streamingUrl?: string;
}) {
  // Browser tile, live, has a per-channel stream URL → render a mini iframe so
  // every tile shows its own TinyFish session, not a generic "scanning…".
  const showIframe = channel.type === "browser" && status === "live" && !!streamingUrl;
  return (
    <div style={{ aspectRatio: "16 / 9", overflow: "hidden", background: "#f1f5f9", position: "relative" }}>
      {channel.type === "data" ? (
        <div style={{ height: "100%", padding: "6px 8px" }}>
          {channel.id === "gdelt" && <GdeltBody spread={spread} status={status} />}
          {channel.id === "datagovsg" && <DataGovBody findings={findings} status={status} />}
        </div>
      ) : showIframe ? (
        <>
          <iframe
            src={streamingUrl}
            title={channel.name}
            style={{
              width: "100%", height: "100%",
              border: 0, background: "#06121f",
              pointerEvents: "none", // tile click should focus, not interact with iframe
            }}
            sandbox="allow-scripts allow-same-origin"
          />
          {/* tiny LIVE chip overlay so the tile reads as "active stream" */}
          <span style={{
            position: "absolute", top: 4, right: 4,
            fontSize: 8, fontWeight: 800, letterSpacing: 0.4,
            padding: "2px 5px", borderRadius: 3,
            background: "rgba(220,38,38,0.92)", color: "#fff",
            textShadow: "0 1px 0 rgba(0,0,0,0.2)",
          }}>LIVE</span>
        </>
      ) : status === "live" ? (
        // Live but the STREAMING_URL event hasn't landed yet — keep the scanner
        // visible until the iframe URL is ready.
        <ScanningBody />
      ) : status === "done" ? (
        <DoneBody channel={channel} findings={findings} claims={claims} />
      ) : (
        <IdleBody />
      )}
    </div>
  );
}

// ── Body variants ────────────────────────────────────────────────────
function ScanningBody() {
  return (
    <div
      style={{
        height: "100%",
        background: "#f1f5f9",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="grid-scan-line" />
      <div className="grid-scan-text">scanning…</div>
    </div>
  );
}

function IdleBody() {
  return <div style={{ height: "100%", background: "#f1f5f9" }} />;
}

function DoneBody({ channel, findings, claims }: { channel: Channel; findings: Finding[]; claims: Claim[] }) {
  const count =
    channel.lane === "official"
      ? findings.filter((f) => agencyMatch(channel.id, f.agency)).length
      : claims.length > 0
        ? Math.max(1, Math.round(claims.length / 7))
        : 0;
  return (
    <div
      style={{
        height: "100%",
        background: "#f8fafc",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 16, color: DONE_GREY }}>✓</span>
      {count > 0 && (
        <span style={{ fontSize: 10, color: "var(--cara-muted)", fontWeight: 600 }}>
          {count} {channel.lane === "official" ? "fact" : "claim"}
          {count === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

function agencyMatch(channelId: string, agency: string) {
  return agency.toLowerCase().startsWith(channelId.slice(0, 3));
}

// ── Data tile bodies ─────────────────────────────────────────────────
function GdeltBody({ spread, status }: { spread: Spread | null; status: Status }) {
  if (!spread) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--cara-muted)", fontSize: 10 }}>
        {status === "live" ? "querying…" : "—"}
      </div>
    );
  }
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 1 }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--cara-ink)", lineHeight: 1.1 }}>
        {spread.totalArticles.toLocaleString()}
      </div>
      <div style={{ fontSize: 9, color: "var(--cara-muted)" }}>articles · 24h</div>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: NAVY, letterSpacing: 0.3 }}>
        {spread.velocityLabel}
      </div>
      <div style={{ fontSize: 8.5, color: "var(--cara-muted)" }}>
        🇸🇬 {spread.singaporeArticles} · {spread.toneLabel ?? "—"}
      </div>
    </div>
  );
}

function DataGovBody({ findings, status }: { findings: Finding[]; status: Status }) {
  const f = findings.find(matchesDataGov);
  if (!f) {
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--cara-muted)", fontSize: 13 }}>
        {status === "live" ? "querying…" : "..."}
      </div>
    );
  }
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--cara-ink)", lineHeight: 1.1 }}>
        {f.stat ?? "live"}
      </div>
      <div style={{ fontSize: 10, color: "var(--cara-muted)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {f.text}
      </div>
    </div>
  );
}
