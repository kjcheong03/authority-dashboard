/* ───────────────────────────────────────────────────────────────────────────
 * Seeded public "community feed". Stands in for aggregated public channels /
 * partner reports. Kept for the recorded dengue replay narrative; the live
 * misinfo phase now does a real web search (see MISINFO_START_URL) rather than
 * scraping this page.
 * ─────────────────────────────────────────────────────────────────────────── */

export const dynamic = "force-static";

interface Post {
  user: string;
  channel: string;
  time: string;
  shares: string;
  text: string;
}

const POSTS: Post[] = [
  {
    user: "Auntie Lim 🌿",
    channel: "WhatsApp · East Side Neighbours",
    time: "2h ago",
    shares: "3.2k shares",
    text: "URGENT everyone!! My friend doctor said boiling PAPAYA LEAVES and drinking the juice is the ONLY way to survive this East dengue surge. Forward to all your elderly relatives, the hospitals cannot help once you get it!!",
  },
  {
    user: "tampines_resident_88",
    channel: "Community Forum · Tampines",
    time: "5h ago",
    shares: "612 replies",
    text: "Heard from a friend that the NEA chemical spraying scheduled for Tampines has been cancelled due to budget cuts. So no point keeping windows open lah, they're not coming.",
  },
  {
    user: "Healthy Living SG",
    channel: "Messaging Group · Seniors Wellness",
    time: "8h ago",
    shares: "850 shares",
    text: "Good news for the elderly: dengue only affects children and young people. So our senior folks don't really need to take precautions, just relax and stay home.",
  },
  {
    user: "Marcus T.",
    channel: "Community Forum · Pasir Ris",
    time: "1d ago",
    shares: "44 replies",
    text: "Anyone else notice a lot more mosquitoes near Pasir Ris Drive 3 this week? Got a few neighbours down with fever already.",
  },
  {
    user: "concerned_parent",
    channel: "WhatsApp · Block 201 Residents",
    time: "1d ago",
    shares: "120 shares",
    text: "Just sharing — please remove any standing water at home, the cluster is getting worse. Better safe than sorry for our older family members.",
  },
  {
    user: "wellness_tips_daily",
    channel: "Messaging Group · Health Tips",
    time: "2d ago",
    shares: "1.1k shares",
    text: "Mosquito coils + vitamin C megadose will make you immune to dengue. No need repellent, no need see doctor. Natural immunity is best!",
  },
];

export default function FeedPage() {
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif", color: "#1a1a1a" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>East Region Community Feed</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
        Aggregated public posts and forwarded messages about the current dengue situation.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {POSTS.map((p, i) => (
          <li
            key={i}
            data-claim
            style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 16, background: "#fff" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 14 }}>{p.user}</strong>
              <span style={{ fontSize: 12, color: "#999" }}>{p.time}</span>
            </div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
              {p.channel} · {p.shares}
            </div>
            <p style={{ fontSize: 15, lineHeight: 1.5, margin: 0 }}>{p.text}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
