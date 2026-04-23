import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getJiraReadiness } from "@/lib/integrations/jira-readiness";
import { syncUserJiraData } from "@/lib/services/sync";

export const maxDuration = 120;

export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getJiraReadiness();
  if (!readiness.fullyReady) {
    return NextResponse.json(
      { error: "Jira integration is not enabled yet", readiness },
      { status: 503 },
    );
  }

  try {
    const summary = await syncUserJiraData(user.id, "initial");
    return NextResponse.json({ ok: true, summary, debugBuild: "jira-sync-exec-v1" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Jira sync failed",
        details: error instanceof Error ? error.message : "Unknown sync error",
      },
      { status: 500 },
    );
  }
}
