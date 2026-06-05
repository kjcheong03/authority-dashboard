import { listRecentTopics } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 0; // fresh every load — list grows as new runs happen

export async function GET() {
  const topics = await listRecentTopics(20);
  return Response.json(topics);
}
