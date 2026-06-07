/**
 * Smoke-test every scraper against a live topic and report results.
 *
 *   npx tsx scripts/test-scrapers.ts          # topic = "COVID-19"
 *   npx tsx scripts/test-scrapers.ts Dengue   # custom topic
 *
 * Prints one line per scraper: pass/fail, item count, first item preview,
 * error message if it returned an error. Each scraper gets 20 s before being
 * declared a timeout.
 */
import moh from "../lib/scrapers/moh";
import nea from "../lib/scrapers/nea";
import who from "../lib/scrapers/who";
import cdc from "../lib/scrapers/cdc";
import healthhub from "../lib/scrapers/healthhub";
import reddit from "../lib/scrapers/reddit";
import hwz from "../lib/scrapers/hwz";
import mothership from "../lib/scrapers/mothership";
import telegram from "../lib/scrapers/telegram";
import ddg from "../lib/scrapers/ddg";
import type { Scraper, ScrapeResult } from "../lib/scrapers/types";

const TOPIC = process.argv[2] ?? "COVID-19";
const TIMEOUT_MS = 20_000;

interface Entry {
  id: string;
  lane: "verified" | "online";
  fn: Scraper;
}

const SCRAPERS: Entry[] = [
  { id: "moh",        lane: "verified", fn: moh },
  { id: "nea",        lane: "verified", fn: nea },
  { id: "who",        lane: "verified", fn: who },
  { id: "cdc",        lane: "verified", fn: cdc },
  { id: "healthhub",  lane: "verified", fn: healthhub },
  { id: "reddit",     lane: "online",   fn: reddit },
  { id: "hwz",        lane: "online",   fn: hwz },
  { id: "mothership", lane: "online",   fn: mothership },
  { id: "telegram",   lane: "online",   fn: telegram },
  { id: "ddg",        lane: "online",   fn: ddg },
];

async function withTimeout(p: Promise<ScrapeResult>, ms: number): Promise<ScrapeResult> {
  return Promise.race([
    p,
    new Promise<ScrapeResult>((resolve) =>
      setTimeout(() => resolve({ items: [], error: `timeout (${ms} ms)` }), ms),
    ),
  ]);
}

function preview(s: string, n = 80): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : clean.slice(0, n - 1) + "…";
}

(async () => {
  console.log("\n──────────────────────────────────────────────────────────────");
  console.log(`Scraper smoke test · topic = "${TOPIC}"`);
  console.log("──────────────────────────────────────────────────────────────\n");

  const results = await Promise.all(
    SCRAPERS.map(async ({ id, lane, fn }) => {
      const t0 = performance.now();
      let result: ScrapeResult;
      try {
        result = await withTimeout(fn(TOPIC), TIMEOUT_MS);
      } catch (e) {
        result = { items: [], error: e instanceof Error ? e.message : String(e) };
      }
      const ms = Math.round(performance.now() - t0);
      return { id, lane, ms, result };
    }),
  );

  for (const r of results) {
    const n = r.result.items.length;
    const ok = n > 0;
    const status = ok ? "✓" : "✗";
    const tag = ok ? "PASS" : "FAIL";
    console.log(`${status} [${tag}] ${r.id.padEnd(11)} (${r.lane.padEnd(8)}) · ${String(n).padStart(2)} items · ${String(r.ms).padStart(5)} ms${r.result.error ? "  ⚠ " + r.result.error : ""}`);
    if (ok) {
      const first = r.result.items[0];
      const tag2 = first.agency ? `agency=${first.agency}` : first.where ? `where=${first.where}` : "—";
      console.log(`   ▸ ${tag2}`);
      console.log(`   ▸ text: ${preview(first.text)}`);
      if (first.url) console.log(`   ▸ url:  ${preview(first.url, 100)}`);
      if (first.shares) console.log(`   ▸ shares: ${preview(first.shares)}`);
    }
  }

  console.log("");
  const pass = results.filter((r) => r.result.items.length > 0).length;
  const fail = results.length - pass;
  console.log(`Summary: ${pass}/${results.length} scrapers returned items (${fail} need OpenAI fallback)`);
  console.log("");
})();
