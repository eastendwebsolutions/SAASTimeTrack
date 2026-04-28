import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies, reportingSprints, timeEntries, users } from "@/lib/db/schema";
import { getReportingAdapter } from "@/lib/services/reports/adapter-registry";
import { getRetrospectiveFiltersData, listProjectsForWorkspace, listStatusesForWorkspace } from "@/lib/services/reports/retrospective-query";
import { resolveWorkspaceScopedCompanyIdsForSuperAdmin } from "@/lib/services/workspace-options";
import { requireReportUser, toServerErrorResponse } from "@/app/api/reports/retrospective/_shared";

export async function GET(request: NextRequest) {
  const { user, response } = await requireReportUser();
  if (!user) return response!;

  try {
    const integrationType = (request.nextUrl.searchParams.get("integrationType") ?? "asana") as "asana" | "jira" | "monday";
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    const requestedCompanyId = request.nextUrl.searchParams.get("companyId") ?? undefined;
    const companyId = user.role === "super_admin" && requestedCompanyId ? requestedCompanyId : user.companyId;
    const scopedCompanyIds =
      user.role === "super_admin"
        ? await resolveWorkspaceScopedCompanyIdsForSuperAdmin(companyId)
        : [user.companyId];
    const adapter = getReportingAdapter(integrationType);
    const base = await getRetrospectiveFiltersData(user, companyId);
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
      columns: { asanaWorkspaceId: true },
    });
    const companyWorkspaceId = company?.asanaWorkspaceId?.trim() || null;
    const adapterWorkspaceRows = await Promise.all(scopedCompanyIds.map((id) => adapter.getWorkspaces(id)));
    const workspaceMap = new Map<string, (typeof adapterWorkspaceRows)[number][number]>();
    for (const workspaceRows of adapterWorkspaceRows) {
      for (const row of workspaceRows) {
        workspaceMap.set(`${row.externalIntegrationType}:${row.workspace.externalWorkspaceId}`, row);
      }
    }
    const workspaces = [...workspaceMap.values()];
    if (integrationType === "asana" && companyWorkspaceId) {
      const exists = workspaces.some((item) => item.workspace.externalWorkspaceId === companyWorkspaceId);
      if (!exists) {
        workspaces.unshift({
          externalIntegrationType: "asana",
          externalIntegrationId: `company:${companyWorkspaceId}`,
          workspace: {
            externalWorkspaceId: companyWorkspaceId,
            workspaceName: "My Asana Workspace",
          },
        });
      }
    }
    const sprints = workspaceId
      ? await db.query.reportingSprints.findMany({
          where: and(
            inArray(reportingSprints.companyId, scopedCompanyIds),
            eq(reportingSprints.integrationType, integrationType),
            eq(reportingSprints.externalWorkspaceId, workspaceId),
          ),
          columns: {
            externalSprintId: true,
            sprintName: true,
            startDate: true,
            endDate: true,
          },
          orderBy: (table, { desc }) => [desc(table.endDate)],
        })
      : [];

    const projects = workspaceId ? await listProjectsForWorkspace(scopedCompanyIds, integrationType, workspaceId) : [];
    const taskStatuses = workspaceId ? await listStatusesForWorkspace(scopedCompanyIds, integrationType, workspaceId) : [];
    const workspaceUsers = workspaceId
      ? await db
          .selectDistinct({
            id: users.id,
            email: users.email,
          })
          .from(timeEntries)
          .innerJoin(users, eq(users.id, timeEntries.userId))
          .where(and(
            inArray(timeEntries.companyId, scopedCompanyIds),
            eq(timeEntries.integrationType, integrationType),
            eq(timeEntries.externalWorkspaceId, workspaceId),
          ))
      : [];

    return NextResponse.json({
      ...base,
      workspaces,
      defaultWorkspaceId: companyWorkspaceId,
      sprints,
      projects,
      taskStatuses,
      workspaceUsers,
    });
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
