import { NextRequest, NextResponse } from "next/server";
import { getTaskTimeEntryDrilldown } from "@/lib/services/reports/retrospective-query";
import { parseRetrospectiveFilters } from "@/lib/services/reports/retrospective-validation";
import { requireReportUser, toServerErrorResponse } from "@/app/api/reports/retrospective/_shared";

export async function GET(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const { user, response } = await requireReportUser();
  if (!user) return response!;

  try {
    const filters = parseRetrospectiveFilters(request.nextUrl.searchParams);
    const { taskId } = await context.params;
    const entries = await getTaskTimeEntryDrilldown(user, filters, taskId);
    return NextResponse.json(entries);
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
