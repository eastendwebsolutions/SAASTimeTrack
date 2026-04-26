import { NextRequest, NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { getRetrospectiveTable } from "@/lib/services/reports/retrospective-query";
import { parseRetrospectiveFilters } from "@/lib/services/reports/retrospective-validation";
import { requireReportUser, toServerErrorResponse } from "@/app/api/reports/retrospective/_shared";

export async function GET(request: NextRequest) {
  const { user, response } = await requireReportUser();
  if (!user) return response!;

  try {
    const filters = parseRetrospectiveFilters(request.nextUrl.searchParams);
    const table = await getRetrospectiveTable(user, filters);
    const flattened = table.flatMap((member) =>
      member.tasks.map((task) => ({
        teamMember: member.teamMember,
        integration: member.integration,
        workspace: member.workspace,
        period: member.period,
        project: task.project,
        task: task.task,
        subtask: task.subtask ?? "",
        estimatedHours: task.estimatedHours ?? "",
        actualLoggedHours: task.actualLoggedHours,
        storyPoints: task.storyPoints ?? "N/A",
        actualPoints: task.actualPoints ?? "N/A",
        varianceHours: task.varianceHours ?? "",
        variancePct: task.variancePct ?? "",
        taskStatus: task.taskStatus ?? "",
        completionDate: task.completionDate ?? "",
        timeEntryCount: task.timeEntryCount,
        lastTimeEntryDate: task.lastTimeEntryDate ?? "",
      })),
    );
    const csv = stringify(flattened, { header: true });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=retrospective-detail.csv",
      },
    });
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
