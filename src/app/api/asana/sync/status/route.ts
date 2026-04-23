import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { syncRuns } from "@/lib/db/schema";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const latestRun = await db.query.syncRuns.findFirst({
    where: and(eq(syncRuns.companyId, user.companyId), eq(syncRuns.userId, user.id)),
    orderBy: (table) => [desc(table.startedAt)],
  });

  return NextResponse.json({
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
  });
}
