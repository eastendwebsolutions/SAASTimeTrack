import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { AuditTrailTable } from "@/components/audit/audit-trail-table";
import { projects, tasks } from "@/lib/db/schema";
import { Card } from "@/components/ui/card";
import { QuickEntryForm } from "@/components/time/quick-entry-form";
import { getActiveProviderForUser } from "@/lib/integrations/provider";
import { listAuditChanges } from "@/lib/services/audit-log";

type SearchParams = Promise<{ auditPage?: string }>;

export default async function TimePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null;
  }
  const params = await searchParams;
  const auditPage = Math.max(1, Number(params.auditPage ?? "1") || 1);
  const activeProvider = getActiveProviderForUser(user);

  const availableProjects = await db.query.projects.findMany({
    where: and(
      eq(projects.companyId, user.companyId),
      eq(projects.syncedByUserId, user.id),
      eq(projects.provider, activeProvider),
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

  const audit = await listAuditChanges({
    companyId: user.companyId,
    pageKey: "quick_time_entry",
    page: auditPage,
    pageSize: 10,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Quick Time Entry</h1>
      <Card className="p-5">
        <QuickEntryForm projects={availableProjects} tasks={availableTasks} />
      </Card>
      <AuditTrailTable
        rows={audit.rows}
        page={audit.page}
        totalPages={audit.totalPages}
        pageParam="auditPage"
        basePath="/time"
      />
    </div>
  );
}
