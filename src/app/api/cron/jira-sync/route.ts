import { NextResponse } from "next/server";
import { getJiraReadiness } from "@/lib/integrations/jira-readiness";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getJiraReadiness();
  if (!readiness.fullyReady) {
    return NextResponse.json({ ok: true, skipped: true, reason: "jira_not_ready", readiness });
  }

  return NextResponse.json({ ok: true, skipped: true, reason: "jira_sync_staged_not_enabled" });
}
