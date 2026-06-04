import { listRecentRuns } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const runs = await listRecentRuns(20);
  return Response.json(runs);
}
