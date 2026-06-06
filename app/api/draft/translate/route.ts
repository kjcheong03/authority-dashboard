/* ───────────────────────────────────────────────────────────────────────────
 * POST /api/draft/translate
 *
 * Translates a broadcast headline + body into a CARA app language, preserving
 * the markdown. Used by the Broadcast panel's language dropdown to preview the
 * advisory in any of CARA's supported languages.
 *
 * Body: { title, body, lang }   →   { title, body }
 * ─────────────────────────────────────────────────────────────────────────── */

import { translateAdvisory } from "@/lib/agents";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { title?: string; body?: string; lang?: string };
  if (!b.title && !b.body) return new Response("Missing content", { status: 400 });
  const result = await translateAdvisory(b.title ?? "", b.body ?? "", b.lang ?? "en");
  return Response.json(result);
}
