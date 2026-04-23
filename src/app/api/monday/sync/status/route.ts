import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { getMondayReadiness } from "@/lib/integrations/monday-readiness";
import { syncRuns } from "@/lib/db/schema";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readiness = await getMondayReadiness();
  const latestRun = readiness.schemaReady
    ? await db.query.syncRuns.findFirst({
        where: and(
          eq(syncRuns.companyId, user.companyId),
          eq(syncRuns.userId, user.id),
          inArray(syncRuns.type, ["monday_initial", "monday_periodic", "monday_manual"]),
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
