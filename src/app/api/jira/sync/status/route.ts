import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getJiraReadiness } from "@/lib/integrations/jira-readiness";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getJiraReadiness();
  return NextResponse.json({
    readiness,
    latestRun: null,
    status: readiness.fullyReady ? "staged_not_running" : "disabled",
  });
}
