import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { projects, tasks, timeEntries, users } from "@/lib/db/schema";
import { getWeekBounds } from "@/lib/services/week";
import { TimesheetDetailEditor } from "@/components/admin/timesheet-detail-editor";

type SearchParams = Promise<{ userId?: string; weekStart?: string }>;

function toDateInputValue(value: Date) {
  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default async function AdminTimesheetDetailPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getOrCreateCurrentUser();
  if (!user || !canReviewEntries(user.role)) {
    return <p className="text-zinc-400">Admin access required.</p>;
  }

  const params = await searchParams;
  const targetUserId = params.userId;
  const weekStart = params.weekStart;
  if (!targetUserId || !weekStart) {
    return <p className="text-zinc-400">Missing user/week parameters.</p>;
  }

  const targetUser = await db.query.users.findFirst({ where: eq(users.id, targetUserId) });
  if (!targetUser) {
    return <p className="text-zinc-400">User not found.</p>;
  }
  if (!isSuperAdmin(user.role) && targetUser.companyId !== user.companyId) {
    return <p className="text-zinc-400">Forbidden.</p>;
  }

  const bounds = getWeekBounds(new Date(weekStart));
  const entries = await db.query.timeEntries.findMany({
    where: and(eq(timeEntries.userId, targetUserId), gte(timeEntries.entryDate, bounds.start), lte(timeEntries.entryDate, bounds.end)),
    orderBy: (table, { asc }) => [asc(table.timeIn)],
  });

  const entryProjectIds = [...new Set(entries.map((e) => e.projectId))];
  const entryTaskIds = new Set<string>();
  for (const e of entries) {
    entryTaskIds.add(e.taskId);
    if (e.subtaskId) entryTaskIds.add(e.subtaskId);
  }
  const entryTaskIdList = [...entryTaskIds];

  const companyProjects = await db.query.projects.findMany({
    where: and(
      eq(projects.companyId, targetUser.companyId),
      eq(projects.syncedByUserId, targetUserId),
      entryProjectIds.length > 0
        ? or(eq(projects.isActive, true), inArray(projects.id, entryProjectIds))
        : eq(projects.isActive, true),
    ),
    orderBy: (table, { asc }) => [asc(table.name)],
  });
  const projectIds = companyProjects.map((project) => project.id);
  const companyTasks =
    projectIds.length > 0
      ? await db.query.tasks.findMany({
          where: and(
            inArray(tasks.projectId, projectIds),
            entryTaskIdList.length > 0
              ? or(eq(tasks.isActive, true), inArray(tasks.id, entryTaskIdList))
              : eq(tasks.isActive, true),
          ),
          orderBy: (table, { asc }) => [asc(table.name)],
        })
      : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Timesheet Detail Editor</h1>
      <p className="text-sm text-zinc-400">
        User: {targetUser.email} | Week of {bounds.start.toLocaleDateString("en-US")}
      </p>
      <Card className="overflow-x-auto p-3">
        <TimesheetDetailEditor
          entries={entries.map((entry) => ({
            id: entry.id,
            projectId: entry.projectId,
            taskId: entry.taskId,
            subtaskId: entry.subtaskId,
            entryDate: toDateInputValue(new Date(entry.entryDate)),
            timeIn: new Date(entry.timeIn).toISOString(),
            timeOut: new Date(entry.timeOut).toISOString(),
            summary: entry.summary,
            status: entry.status,
          }))}
          timezone={targetUser.timezone ?? "UTC"}
          projects={companyProjects.map((project) => ({ id: project.id, name: project.name }))}
          tasks={companyTasks.map((task) => ({
            id: task.id,
            name: task.name,
            projectId: task.projectId,
            parentTaskId: task.parentTaskId,
          }))}
        />
      </Card>
    </div>
  );
}
