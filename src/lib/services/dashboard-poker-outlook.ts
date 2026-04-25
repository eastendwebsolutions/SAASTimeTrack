import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ppSessionParticipants,
  ppSessions,
  ppSessionVersions,
  ppStories,
  projects,
  tasks,
} from "@/lib/db/schema";

export type PokerOutlook = {
  sessionId: string;
  sessionTitle: string;
  completedAt: Date | null;
  teamStoryPoints: number;
  myStoryPoints: number;
  myTaskCount: number;
} | null;

export async function getDashboardPokerOutlook(args: { userId: string; companyId: string }): Promise<PokerOutlook> {
  const completedSessions = await db.query.ppSessions.findMany({
    where: and(eq(ppSessions.companyId, args.companyId), eq(ppSessions.status, "completed")),
    orderBy: (t, { desc: d }) => [d(t.completedAt), d(t.updatedAt)],
    limit: 25,
  });

  for (const session of completedSessions) {
    const version = await db.query.ppSessionVersions.findFirst({
      where: and(eq(ppSessionVersions.sessionId, session.id), eq(ppSessionVersions.versionNumber, session.currentVersion)),
    });
    if (!version) continue;

    const membership = await db.query.ppSessionParticipants.findFirst({
      where: and(
        eq(ppSessionParticipants.sessionId, session.id),
        eq(ppSessionParticipants.versionId, version.id),
        eq(ppSessionParticipants.userId, args.userId),
      ),
    });
    if (!membership) continue;

    const [totals] = await db
      .select({
        teamPoints: sql<number>`coalesce(sum(${ppStories.finalEstimate}), 0)`.mapWith(Number),
      })
      .from(ppStories)
      .where(
        and(
          eq(ppStories.sessionId, session.id),
          eq(ppStories.versionId, version.id),
          eq(ppStories.status, "finalized"),
        ),
      );

    const [mine] = await db
      .select({
        myPoints: sql<number>`coalesce(sum(${ppStories.finalEstimate}), 0)`.mapWith(Number),
        myCount: count(),
      })
      .from(ppStories)
      .innerJoin(tasks, eq(tasks.asanaTaskId, ppStories.asanaTaskGid))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(ppStories.sessionId, session.id),
          eq(ppStories.versionId, version.id),
          eq(ppStories.status, "finalized"),
          eq(tasks.assignedUserId, args.userId),
          eq(projects.syncedByUserId, args.userId),
        ),
      );

    return {
      sessionId: session.id,
      sessionTitle: session.title,
      completedAt: session.completedAt,
      teamStoryPoints: totals?.teamPoints ?? 0,
      myStoryPoints: mine?.myPoints ?? 0,
      myTaskCount: Number(mine?.myCount ?? 0),
    };
  }

  return null;
}
