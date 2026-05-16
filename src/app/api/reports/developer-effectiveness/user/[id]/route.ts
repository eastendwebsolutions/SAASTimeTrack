import { NextRequest, NextResponse } from "next/server";
import { requireDeveloperEffectivenessAdmin, toServerErrorResponse } from "@/app/api/reports/_shared";
import { parseDeveloperEffectivenessFilters } from "@/lib/services/analytics/developer-effectiveness-validation";
import { getDeveloperEffectivenessUserDetail } from "@/lib/services/analytics/effectiveness-query";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  try {
    const { id } = await params;
    const filters = parseDeveloperEffectivenessFilters(request.nextUrl.searchParams);
    const detail = await getDeveloperEffectivenessUserDetail(user, id, filters);
    return NextResponse.json(detail);
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
