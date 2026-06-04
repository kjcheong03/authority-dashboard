import { loadRun } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const hydrated = await loadRun(id);
  if (!hydrated) return new Response("Not found", { status: 404 });
  return Response.json(hydrated);
}
