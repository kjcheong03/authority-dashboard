import { fetchDengueClusters } from "@/lib/datagovsg";

export const runtime = "nodejs";
// Cache for an hour — dengue cluster data refreshes daily on data.gov.sg, no
// need to hit the upstream poll-download API on every page load.
export const revalidate = 3600;

export async function GET() {
  const data = await fetchDengueClusters();
  return Response.json(data ?? null, { status: data ? 200 : 200 });
}
