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
    const summaryRows = table.map((member) => {
      const estimated = member.tasks.reduce((sum, task) => sum + (task.estimatedHours ?? 0), 0);
      const actual = member.tasks.reduce((sum, task) => sum + task.actualLoggedHours, 0);
      const storyPoints = member.tasks.reduce((sum, task) => sum + (task.storyPoints ?? 0), 0);
      const actualPoints = member.tasks.reduce((sum, task) => sum + (task.actualPoints ?? 0), 0);
      return {
        teamMember: member.teamMember,
        integration: member.integration,
        workspace: member.workspace,
        period: member.period,
        taskCount: member.tasks.length,
        estimatedHours: estimated,
        actualHours: actual,
        hourVariance: actual - estimated,
        storyPoints: storyPoints || "N/A",
        actualPoints: actualPoints || "N/A",
        pointVariance: storyPoints || actualPoints ? actualPoints - storyPoints : "N/A",
      };
    });

    const csv = stringify(summaryRows, { header: true });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=retrospective-user-summary.csv",
      },
    });
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
