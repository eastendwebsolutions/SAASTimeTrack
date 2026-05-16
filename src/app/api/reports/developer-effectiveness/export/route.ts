import { NextRequest, NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import Excel from "exceljs";
import { requireDeveloperEffectivenessAdmin, toServerErrorResponse } from "@/app/api/reports/_shared";
import { parseDeveloperEffectivenessFilters } from "@/lib/services/analytics/developer-effectiveness-validation";
import { getDeveloperEffectivenessTable } from "@/lib/services/analytics/effectiveness-query";

export async function GET(request: NextRequest) {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  try {
    const format = request.nextUrl.searchParams.get("format") ?? "csv";
    const filters = parseDeveloperEffectivenessFilters(request.nextUrl.searchParams);
    const { rows } = await getDeveloperEffectivenessTable(user, filters);

    if (format === "xlsx") {
      const workbook = new Excel.Workbook();
      const sheet = workbook.addWorksheet("Developer effectiveness");
      sheet.columns = [
        { header: "Team member", key: "displayName", width: 28 },
        { header: "Email", key: "email", width: 32 },
        { header: "Delivery score", key: "deliveryScore", width: 14 },
        { header: "AI adoption score", key: "aiAdoptionScore", width: 18 },
        { header: "Tasks completed", key: "tasksCompleted", width: 16 },
        { header: "Story points", key: "storyPointsCompleted", width: 14 },
        { header: "Estimate accuracy", key: "estimateAccuracy", width: 18 },
        { header: "AI acceptance %", key: "acceptanceRate", width: 16 },
        { header: "AI code %", key: "aiCodeShare", width: 12 },
        { header: "Hours / SP", key: "hoursPerStoryPoint", width: 12 },
        { header: "Sprint completion %", key: "sprintCompletionPct", width: 18 },
        { header: "Reopened %", key: "reopenedTaskPct", width: 12 },
        { header: "Last active", key: "lastActiveAt", width: 24 },
        { header: "Band", key: "band", width: 22 },
      ];
      for (const r of rows) {
        sheet.addRow({
          displayName: r.displayName,
          email: r.email,
          deliveryScore: r.deliveryScore,
          aiAdoptionScore: r.aiAdoptionScore,
          tasksCompleted: r.tasksCompleted,
          storyPointsCompleted: r.storyPointsCompleted,
          estimateAccuracy: r.estimateAccuracy != null ? Math.round(r.estimateAccuracy * 1000) / 10 : "",
          acceptanceRate: r.acceptanceRate != null ? Math.round(r.acceptanceRate * 1000) / 10 : "",
          aiCodeShare: r.aiCodeShare != null ? Math.round(r.aiCodeShare * 1000) / 10 : "",
          hoursPerStoryPoint: r.hoursPerStoryPoint != null ? Math.round(r.hoursPerStoryPoint * 100) / 100 : "",
          sprintCompletionPct: r.sprintCompletionPct != null ? Math.round(r.sprintCompletionPct * 10) / 10 : "",
          reopenedTaskPct: r.reopenedTaskPct != null ? Math.round(r.reopenedTaskPct * 10) / 10 : "",
          lastActiveAt: r.lastActiveAt ?? "",
          band: r.band.label,
        });
      }
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="developer-effectiveness.xlsx"',
        },
      });
    }

    const csv = stringify(
      rows.map((r) => ({
        teamMember: r.displayName,
        email: r.email,
        deliveryScore: r.deliveryScore,
        aiAdoptionScore: r.aiAdoptionScore,
        tasksCompleted: r.tasksCompleted,
        storyPointsCompleted: r.storyPointsCompleted,
        estimateAccuracyPct: r.estimateAccuracy != null ? Math.round(r.estimateAccuracy * 1000) / 10 : "",
        aiAcceptancePct: r.acceptanceRate != null ? Math.round(r.acceptanceRate * 1000) / 10 : "",
        aiCodeContributionPct: r.aiCodeShare != null ? Math.round(r.aiCodeShare * 1000) / 10 : "",
        hoursPerStoryPoint: r.hoursPerStoryPoint != null ? Math.round(r.hoursPerStoryPoint * 100) / 100 : "",
        sprintCompletionPct: r.sprintCompletionPct != null ? Math.round(r.sprintCompletionPct * 10) / 10 : "",
        reopenedTaskPct: r.reopenedTaskPct != null ? Math.round(r.reopenedTaskPct * 10) / 10 : "",
        lastActive: r.lastActiveAt ?? "",
        effectivenessBand: r.band.label,
      })),
      { header: true },
    );
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="developer-effectiveness.csv"',
      },
    });
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
