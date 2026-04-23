import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getMondayReadiness } from "@/lib/integrations/monday-readiness";
import { syncUserMondayData } from "@/lib/services/sync";

export const maxDuration = 120;

export async function POST() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getMondayReadiness();
  if (!readiness.fullyReady) {
    return NextResponse.json(
      { error: "Monday integration is not enabled yet", readiness },
      { status: 503 },
    );
  }

  try {
    const summary = await syncUserMondayData(user.id, "initial");
    return NextResponse.json({ ok: true, summary, debugBuild: "monday-sync-exec-v1" });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Monday sync failed",
        details: error instanceof Error ? error.message : "Unknown sync error",
      },
      { status: 500 },
    );
  }
}
