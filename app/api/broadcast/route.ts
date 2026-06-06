import { saveBroadcast, listBroadcasts, deleteBroadcast } from "@/lib/db";

export const runtime = "nodejs";

interface PostBody {
  runId: string;
  title: string;
  body: string;
  urgency: "HIGH" | "NORMAL";
  audienceMode: "all" | "selected";
  targetProfiles: string[];
  translations: Record<string, { title: string; body: string }>;
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Partial<PostBody>;
  if (!b.runId || !b.title || !b.body) {
    return new Response("Missing required fields", { status: 400 });
  }
  const result = await saveBroadcast({
    runId: b.runId,
    title: b.title,
    body: b.body,
    urgency: b.urgency === "NORMAL" ? "NORMAL" : "HIGH",
    audienceMode: b.audienceMode === "selected" ? "selected" : "all",
    targetProfiles: b.targetProfiles ?? [],
    translations: b.translations ?? {},
  });
  if (!result) return new Response("Failed to record broadcast", { status: 500 });
  return Response.json(result);
}

export async function GET() {
  const broadcasts = await listBroadcasts(20);
  return Response.json(broadcasts);
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("Missing id", { status: 400 });
  const ok = await deleteBroadcast(id);
  if (!ok) return new Response("Failed to delete broadcast", { status: 500 });
  return Response.json({ ok: true });
}
