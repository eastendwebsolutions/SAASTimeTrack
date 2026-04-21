import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { projects, tasks } from "@/lib/db/schema";
import { Card } from "@/components/ui/card";
import { QuickEntryForm } from "@/components/time/quick-entry-form";

export default async function TimePage() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null;
  }

  const availableProjects = await db.query.projects.findMany({
    where: and(
      eq(projects.companyId, user.companyId),
      eq(projects.syncedByUserId, user.id),
      eq(projects.isActive, true),
    ),
    orderBy: (table, { asc }) => [asc(table.name)],
  });
  const projectIds = availableProjects.map((project) => project.id);

  const availableTasks = projectIds.length
    ? await db.query.tasks.findMany({
        where: and(inArray(tasks.projectId, projectIds), eq(tasks.isActive, true)),
        orderBy: (table, { asc }) => [asc(table.name)],
      })
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Quick Time Entry</h1>
      <Card className="p-5">
        <QuickEntryForm projects={availableProjects} tasks={availableTasks} />
      </Card>
    </div>
  );
}
