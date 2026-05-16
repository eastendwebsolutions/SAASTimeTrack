import { NextRequest, NextResponse } from "next/server";
import { requireDeveloperEffectivenessAdmin, toServerErrorResponse } from "@/app/api/reports/_shared";
import { parseDeveloperEffectivenessFilters } from "@/lib/services/analytics/developer-effectiveness-validation";
import { getDeveloperEffectivenessQuadrant } from "@/lib/services/analytics/effectiveness-query";

export async function GET(request: NextRequest) {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  try {
    const filters = parseDeveloperEffectivenessFilters(request.nextUrl.searchParams);
    const quadrant = await getDeveloperEffectivenessQuadrant(user, filters);
    return NextResponse.json(quadrant);
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
