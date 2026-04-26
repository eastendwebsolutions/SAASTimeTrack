import { z } from "zod";
import { isIntegrationProvider } from "@/lib/integrations/provider";
import type { RetrospectiveFilters } from "@/lib/services/reports/types";

const baseSchema = z.object({
  companyId: z.string().uuid().optional(),
  integrationType: z.string().refine((value) => isIntegrationProvider(value), "Invalid integration type"),
  workspaceId: z.string().min(1),
  periodMode: z.enum(["sprint", "date_range"]),
  sprintId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  teamMemberIds: z.string().optional(),
  projectId: z.string().optional(),
  taskStatus: z.string().optional(),
});

export function parseRetrospectiveFilters(searchParams: URLSearchParams): RetrospectiveFilters {
  const parsed = baseSchema.parse({
    companyId: searchParams.get("companyId") ?? undefined,
    integrationType: searchParams.get("integrationType") ?? "asana",
    workspaceId: searchParams.get("workspaceId") ?? "",
    periodMode: searchParams.get("periodMode") ?? "date_range",
    sprintId: searchParams.get("sprintId") ?? undefined,
    startDate: searchParams.get("startDate") ?? undefined,
    endDate: searchParams.get("endDate") ?? undefined,
    teamMemberIds: searchParams.get("teamMemberIds") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    taskStatus: searchParams.get("taskStatus") ?? undefined,
  });

  if (parsed.periodMode === "sprint" && !parsed.sprintId) {
    throw new Error("sprintId is required when periodMode=sprint");
  }
  if (parsed.periodMode === "date_range" && (!parsed.startDate || !parsed.endDate)) {
    throw new Error("startDate and endDate are required when periodMode=date_range");
  }

  const startDate = parsed.startDate ? new Date(parsed.startDate) : undefined;
  const endDate = parsed.endDate ? new Date(parsed.endDate) : undefined;
  if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
    throw new Error("Invalid date range");
  }

  return {
    companyId: parsed.companyId,
    integrationType: parsed.integrationType,
    workspaceId: parsed.workspaceId,
    periodMode: parsed.periodMode,
    sprintId: parsed.sprintId,
    startDate,
    endDate,
    teamMemberIds:
      parsed.teamMemberIds && parsed.teamMemberIds !== "all"
        ? parsed.teamMemberIds.split(",").map((id) => id.trim()).filter(Boolean)
        : null,
    projectId: parsed.projectId,
    taskStatus: parsed.taskStatus,
  };
}
