import type { IntegrationProvider } from "@/lib/integrations/provider";

export type PeriodMode = "sprint" | "date_range";

export type RetrospectiveFilters = {
  companyId?: string;
  integrationType: IntegrationProvider;
  workspaceId: string;
  sprintId?: string;
  startDate?: Date;
  endDate?: Date;
  teamMemberIds: string[] | null;
  projectId?: string;
  taskStatus?: string;
  periodMode: PeriodMode;
};

export type ReportScope = {
  companyId: string;
  lockedUserId?: string;
  role: "user" | "company_admin" | "super_admin";
};

export type TrendMetric = "hours" | "points";
