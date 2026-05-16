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
  companyIds: string[];
  lockedUserId?: string;
  role: "user" | "company_admin" | "super_admin";
};

export type DeveloperEffectivenessFilters = RetrospectiveFilters & {
  reportingJobRole?: string;
  adoptionScoreMin?: number;
  deliveryScoreMin?: number;
  tableSort?: string;
  tableSortDir?: "asc" | "desc";
};
