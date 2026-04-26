import { NextRequest, NextResponse } from "next/server";
import { getRetrospectiveSummary } from "@/lib/services/reports/retrospective-query";
import { parseRetrospectiveFilters } from "@/lib/services/reports/retrospective-validation";
import { requireReportUser, toServerErrorResponse } from "@/app/api/reports/retrospective/_shared";

export async function GET(request: NextRequest) {
  const { user, response } = await requireReportUser();
  if (!user) return response!;

  try {
    const filters = parseRetrospectiveFilters(request.nextUrl.searchParams);
    const summary = await getRetrospectiveSummary(user, filters);
    return NextResponse.json(summary);
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
