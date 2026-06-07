import Link from "next/link";
import { listRecentRuns, listBroadcasts } from "@/lib/db";
import Mascot from "@/components/Mascot";
import { DeleteBroadcastButton } from "@/components/DeleteBroadcastButton";

export const runtime = "nodejs";
export const revalidate = 0; // always fresh — this is an audit trail

const VERDICT_COLOR: Record<string, string> = {
  BROADCAST: "#1d4ed8",
  MONITOR: "#b45309",
  "NO ACTION": "#16a34a",
};

const STATUS_COLOR: Record<string, string> = {
  complete: "#16a34a",
  running: "#1d4ed8",
  stopped: "#94a3b8",
  failed: "#dc2626",
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function AuditPage() {
  const [runs, broadcasts] = await Promise.all([listRecentRuns(20), listBroadcasts(20)]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 22px", background: "#002C77" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <span style={{ display: "inline-flex", marginTop: -4 }}>
            <Mascot size={40} variant="calm" animated={false} />
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#ffffff", letterSpacing: -0.1 }}>Authority Dashboard</span>
        </Link>
        <nav style={{ marginLeft: "auto", display: "flex", gap: 14 }}>
          <Link href="/" style={navLink}>Live Scan</Link>
          <Link href="/audit" style={{ ...navLink, color: "#fff", borderBottom: "2px solid #A6C8FF", paddingBottom: 2 }}>Audit Trail</Link>
        </nav>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "var(--orca-ink)", letterSpacing: -0.3 }}>Audit Trail</h1>
          <p style={{ fontSize: 14, color: "var(--orca-muted)", margin: "6px 0 0", lineHeight: 1.55 }}>
            Run history, broadcast approvals, and verification logs.
          </p>
        </div>

        <section style={panel}>
          <div style={panelHeader}>Run history · {runs.length}</div>
          {runs.length === 0 ? (
            <div style={empty}>
              <div style={{ fontSize: 14, color: "var(--orca-muted)" }}>No completed runs yet.</div>
              <div style={{ fontSize: 12, color: "var(--orca-muted)", marginTop: 4 }}>Start a Live Scan; it will be archived here.</div>
            </div>
          ) : (
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Topic</th>
                  <th style={th}>Status</th>
                  <th style={th}>Verdict</th>
                  <th style={th}>Started</th>
                  <th style={th}>Completed</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td style={td}><span style={{ fontWeight: 700, color: "var(--orca-ink)" }}>{r.topic}</span></td>
                    <td style={td}><Tag color={STATUS_COLOR[r.status] ?? "#94a3b8"}>{r.status}</Tag></td>
                    <td style={td}>{r.verdict ? <Tag color={VERDICT_COLOR[r.verdict] ?? "#94a3b8"}>{r.verdict}</Tag> : <span style={{ color: "var(--orca-muted)" }}>—</span>}</td>
                    <td style={td}>{fmtDate(r.created_at)}</td>
                    <td style={td}>{fmtDate(r.completed_at)}</td>
                    <td style={td}>
                      <Link href={`/?run=${r.id}`} style={loadLink}>Load →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section style={panel}>
          <div style={panelHeader}>Broadcast approvals · {broadcasts.length}</div>
          {broadcasts.length === 0 ? (
            <div style={empty}>
              <div style={{ fontSize: 14, color: "var(--orca-muted)" }}>No approved broadcasts yet.</div>
              <div style={{ fontSize: 12, color: "var(--orca-muted)", marginTop: 4 }}>Approving a draft archives an immutable record here.</div>
            </div>
          ) : (
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Confirmation</th>
                  <th style={th}>Topic</th>
                  <th style={th}>Title</th>
                  <th style={th}>Urgency</th>
                  <th style={th}>Reach</th>
                  <th style={th}>Sent</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => {
                  const row = b as { id: string; confirmation_id: string; title: string; urgency: string; reach_estimate: number | null; sent_at: string; runs?: { topic: string } | { topic: string }[] | null };
                  const topic = Array.isArray(row.runs) ? row.runs[0]?.topic : row.runs?.topic;
                  return (
                    <tr key={row.id}>
                      <td style={td}><code style={{ fontSize: 11.5, color: "var(--orca-ink)", fontWeight: 700 }}>{row.confirmation_id}</code></td>
                      <td style={td}>{topic ?? "—"}</td>
                      <td style={td}>{row.title}</td>
                      <td style={td}><Tag color={row.urgency === "HIGH" ? "#dc2626" : "#64748b"}>{row.urgency}</Tag></td>
                      <td style={td}>{row.reach_estimate ? row.reach_estimate.toLocaleString("en-SG") : "—"}</td>
                      <td style={td}>{fmtDate(row.sent_at)}</td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <DeleteBroadcastButton id={row.id} label={row.confirmation_id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4,
      padding: "3px 7px", borderRadius: 4, textTransform: "uppercase",
      background: `${color}15`, color,
    }}>{children}</span>
  );
}

const navLink: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#cfe0ff", textDecoration: "none" };
const panel: React.CSSProperties = { background: "#fff", border: "1px solid var(--orca-line)", borderRadius: 14, overflow: "hidden" };
const panelHeader: React.CSSProperties = {
  padding: "13px 18px", borderBottom: "1px solid var(--orca-line)",
  fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: "var(--orca-muted)", textTransform: "uppercase",
};
const empty: React.CSSProperties = { padding: "26px 18px" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: React.CSSProperties = {
  padding: "10px 14px", textAlign: "left",
  fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: "var(--orca-muted)", textTransform: "uppercase",
  borderBottom: "1px solid var(--orca-line)",
};
const td: React.CSSProperties = { padding: "11px 14px", color: "#334155", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" };
const loadLink: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#002C77", textDecoration: "none" };
