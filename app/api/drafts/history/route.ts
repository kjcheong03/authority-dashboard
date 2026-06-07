import { listDraftHistory } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  if (!runId) return new Response("Missing runId", { status: 400 });
  const entries = await listDraftHistory(runId);
  return Response.json(entries);
}
