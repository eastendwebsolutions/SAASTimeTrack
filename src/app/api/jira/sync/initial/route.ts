import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getJiraReadiness } from "@/lib/integrations/jira-readiness";

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

  return NextResponse.json(
    {
      error: "Jira sync is staged for the next rollout phase.",
      details: "Connect is enabled; sync execution remains intentionally disabled for safety.",
    },
    { status: 501 },
  );
}
