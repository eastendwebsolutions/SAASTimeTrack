import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { syncUserJiraData } from "@/lib/services/sync";

export const maxDuration = 120;

export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await syncUserJiraData(user.id, "initial");
    return NextResponse.json({
      ok: true,
      summary,
      debugBuild: "jira-sync-readiness-v1",
    });
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
