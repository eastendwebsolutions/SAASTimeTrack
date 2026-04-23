import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { getJiraReadiness } from "@/lib/integrations/jira-readiness";
import { syncRuns } from "@/lib/db/schema";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getJiraReadiness();
  const latestRun = readiness.schemaReady
    ? await db.query.syncRuns.findFirst({
        where: and(
          eq(syncRuns.companyId, user.companyId),
          eq(syncRuns.userId, user.id),
          inArray(syncRuns.type, ["jira_initial", "jira_periodic", "jira_manual"]),
        ),
        orderBy: (table) => [desc(table.startedAt)],
      })
    : null;
  return NextResponse.json({
    readiness,
    latestRun: latestRun
      ? {
          status: latestRun.status,
          startedAt: latestRun.startedAt,
          endedAt: latestRun.endedAt,
          error: latestRun.error,
          projectsSynced: latestRun.projectsSynced,
          tasksSynced: latestRun.tasksSynced,
          subtasksSynced: latestRun.subtasksSynced,
        }
      : null,
    status: readiness.fullyReady ? (latestRun?.status ?? "idle") : "disabled",
  });
}
