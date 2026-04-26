import { NextRequest, NextResponse } from "next/server";
import { getRetrospectiveTable } from "@/lib/services/reports/retrospective-query";
import { parseRetrospectiveFilters } from "@/lib/services/reports/retrospective-validation";
import { requireReportUser, toServerErrorResponse } from "@/app/api/reports/retrospective/_shared";

export async function GET(request: NextRequest) {
  const { user, response } = await requireReportUser();
  if (!user) return response!;

  try {
    const filters = parseRetrospectiveFilters(request.nextUrl.searchParams);
    const table = await getRetrospectiveTable(user, filters);
    return NextResponse.json(table);
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
