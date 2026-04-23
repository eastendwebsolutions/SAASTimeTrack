import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getJiraReadiness } from "@/lib/integrations/jira-readiness";

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

  return NextResponse.json({ error: "Jira periodic sync is not enabled in this phase." }, { status: 501 });
}
