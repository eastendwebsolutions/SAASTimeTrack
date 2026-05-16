import { NextRequest, NextResponse } from "next/server";
import { requireDeveloperEffectivenessAdmin, toServerErrorResponse } from "@/app/api/reports/_shared";
import { getDeveloperEffectivenessFiltersData } from "@/lib/services/analytics/effectiveness-query";

export async function GET(request: NextRequest) {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  try {
    const companyId = request.nextUrl.searchParams.get("companyId") ?? undefined;
    const data = await getDeveloperEffectivenessFiltersData(user, companyId);
    return NextResponse.json(data);
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
