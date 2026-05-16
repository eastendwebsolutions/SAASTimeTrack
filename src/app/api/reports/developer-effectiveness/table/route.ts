import { NextRequest, NextResponse } from "next/server";
import { requireDeveloperEffectivenessAdmin, toServerErrorResponse } from "@/app/api/reports/_shared";
import { parseDeveloperEffectivenessFilters } from "@/lib/services/analytics/developer-effectiveness-validation";
import { getDeveloperEffectivenessTable } from "@/lib/services/analytics/effectiveness-query";

export async function GET(request: NextRequest) {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  try {
    const filters = parseDeveloperEffectivenessFilters(request.nextUrl.searchParams);
    const table = await getDeveloperEffectivenessTable(user, filters);
    return NextResponse.json(table);
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
