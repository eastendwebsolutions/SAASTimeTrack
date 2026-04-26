import type { IntegrationProvider } from "@/lib/integrations/provider";

export type NormalizedWorkspace = {
  externalIntegrationType: IntegrationProvider;
  externalIntegrationId: string;
  workspace: {
    externalWorkspaceId: string;
    workspaceName: string;
  };
};

export type NormalizedSprint = {
  externalIntegrationType: IntegrationProvider;
  externalIntegrationId: string;
  sprint: {
    externalWorkspaceId: string;
    externalSprintId: string;
    sprintName: string;
    startDate: Date;
    endDate: Date;
    status: "planned" | "active" | "completed" | "archived";
  };
};

export type NormalizedTask = {
  externalIntegrationType: IntegrationProvider;
  externalIntegrationId: string;
  task: {
    externalWorkspaceId: string;
    externalProjectId?: string | null;
    externalSprintId?: string | null;
    externalTaskId: string;
    externalParentTaskId?: string | null;
    taskName: string;
    projectName?: string | null;
    assigneeExternalId?: string | null;
    assigneeUserId?: string | null;
    estimateHours?: number | null;
    storyPoints?: number | null;
    actualPoints?: number | null;
    taskStatus?: string | null;
    completedAt?: Date | null;
  };
};

export interface IntegrationReportingAdapter {
  provider: IntegrationProvider;
  getWorkspaces(companyId: string): Promise<NormalizedWorkspace[]>;
  getSprints(companyId: string, workspaceId: string): Promise<NormalizedSprint[]>;
  getTasks(companyId: string, workspaceId: string): Promise<NormalizedTask[]>;
  normalizeTask(task: NormalizedTask): NormalizedTask;
  normalizeSprint(sprint: NormalizedSprint): NormalizedSprint;
}
