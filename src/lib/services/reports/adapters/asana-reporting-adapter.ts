import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { integrationFieldMappings, reportingSprints, reportingTasks, reportingWorkspaces } from "@/lib/db/schema";
import { isMissingIntegrationSchemaError } from "@/lib/integrations/schema-compat";
import type {
  IntegrationReportingAdapter,
  NormalizedSprint,
  NormalizedTask,
  NormalizedWorkspace,
} from "@/lib/services/reports/integration-reporting-adapter";

export class AsanaReportingAdapter implements IntegrationReportingAdapter {
  provider = "asana" as const;

  async getWorkspaces(companyId: string): Promise<NormalizedWorkspace[]> {
    const rows = await db.query.reportingWorkspaces.findMany({
      where: and(eq(reportingWorkspaces.companyId, companyId), eq(reportingWorkspaces.integrationType, "asana")),
      orderBy: (table, { asc }) => [asc(table.workspaceName)],
    }).catch((error) => {
      if (isMissingIntegrationSchemaError(error)) return [];
      throw error;
    });
    return rows.map((row) => ({
      externalIntegrationType: "asana",
      externalIntegrationId: row.id,
      workspace: {
        externalWorkspaceId: row.externalWorkspaceId,
        workspaceName: row.workspaceName,
      },
    }));
  }

  async getSprints(companyId: string, workspaceId: string): Promise<NormalizedSprint[]> {
    const rows = await db.query.reportingSprints.findMany({
      where: and(
        eq(reportingSprints.companyId, companyId),
        eq(reportingSprints.integrationType, "asana"),
        eq(reportingSprints.externalWorkspaceId, workspaceId),
      ),
      orderBy: (table, { desc }) => [desc(table.endDate)],
    }).catch((error) => {
      if (isMissingIntegrationSchemaError(error)) return [];
      throw error;
    });
    return rows.map((row) => ({
      externalIntegrationType: "asana",
      externalIntegrationId: row.id,
      sprint: {
        externalWorkspaceId: row.externalWorkspaceId,
        externalSprintId: row.externalSprintId,
        sprintName: row.sprintName,
        startDate: row.startDate,
        endDate: row.endDate,
        status: row.status,
      },
    }));
  }

  async getTasks(companyId: string, workspaceId: string): Promise<NormalizedTask[]> {
    const rows = await db.query.reportingTasks.findMany({
      where: and(
        eq(reportingTasks.companyId, companyId),
        eq(reportingTasks.integrationType, "asana"),
        eq(reportingTasks.externalWorkspaceId, workspaceId),
      ),
    }).catch((error) => {
      if (isMissingIntegrationSchemaError(error)) return [];
      throw error;
    });

    return rows.map((row) => ({
      externalIntegrationType: "asana",
      externalIntegrationId: row.id,
      task: {
        externalWorkspaceId: row.externalWorkspaceId,
        externalProjectId: row.externalProjectId,
        externalSprintId: row.externalSprintId,
        externalTaskId: row.externalTaskId,
        externalParentTaskId: row.externalParentTaskId,
        taskName: row.taskName,
        projectName: row.projectName,
        assigneeExternalId: row.assigneeExternalId,
        assigneeUserId: row.assigneeUserId,
        estimateHours: row.estimateHours ? Number(row.estimateHours) : null,
        storyPoints: row.storyPoints ? Number(row.storyPoints) : null,
        actualPoints: row.actualPoints ? Number(row.actualPoints) : null,
        taskStatus: row.taskStatus,
        completedAt: row.completedAt,
      },
    }));
  }

  normalizeTask(task: NormalizedTask) {
    return task;
  }

  normalizeSprint(sprint: NormalizedSprint) {
    return sprint;
  }
}

export async function getAsanaReportingMapping(companyId: string) {
  const rows = await db.query.integrationFieldMappings.findMany({
    where: and(
      eq(integrationFieldMappings.companyId, companyId),
      eq(integrationFieldMappings.integrationType, "asana"),
      eq(integrationFieldMappings.scopeType, "company"),
      eq(integrationFieldMappings.isActive, true),
    ),
    orderBy: (table, { asc }) => [asc(table.mappingKey)],
  }).catch((error) => {
    if (isMissingIntegrationSchemaError(error)) return [];
    throw error;
  });

  return rows.reduce<Record<string, { id: string | null; name: string | null }>>((acc, row) => {
    acc[row.mappingKey] = {
      id: row.externalFieldId ?? null,
      name: row.externalFieldName ?? null,
    };
    return acc;
  }, {});
}
