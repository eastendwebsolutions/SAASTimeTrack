import { NextRequest, NextResponse } from "next/server";
import { requireDeveloperEffectivenessAdmin, toServerErrorResponse } from "@/app/api/reports/_shared";
import { parseDeveloperEffectivenessFilters } from "@/lib/services/analytics/developer-effectiveness-validation";
import { getDeveloperEffectivenessTrends } from "@/lib/services/analytics/effectiveness-query";

export async function GET(request: NextRequest) {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  try {
    const filters = parseDeveloperEffectivenessFilters(request.nextUrl.searchParams);
    const overlay = (request.nextUrl.searchParams.get("overlay") as "none" | "team" | "company") ?? "none";
    const trends = await getDeveloperEffectivenessTrends(user, filters, overlay);
    return NextResponse.json(trends);
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
