import { NextRequest, NextResponse } from "next/server";
import { requireDeveloperEffectivenessAdmin, toServerErrorResponse } from "@/app/api/reports/_shared";
import { parseDeveloperEffectivenessFilters } from "@/lib/services/analytics/developer-effectiveness-validation";
import { getDeveloperEffectivenessSummary } from "@/lib/services/analytics/effectiveness-query";

export async function GET(request: NextRequest) {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  try {
    const filters = parseDeveloperEffectivenessFilters(request.nextUrl.searchParams);
    const summary = await getDeveloperEffectivenessSummary(user, filters);
    return NextResponse.json(summary);
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
