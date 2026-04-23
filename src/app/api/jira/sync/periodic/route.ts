import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getJiraReadiness } from "@/lib/integrations/jira-readiness";
import { syncUserJiraData } from "@/lib/services/sync";

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

  await syncUserJiraData(user.id, "periodic");
  return NextResponse.json({ ok: true });
}
