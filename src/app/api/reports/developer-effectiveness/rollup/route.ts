import { NextRequest, NextResponse } from "next/server";
import { requireDeveloperEffectivenessAdmin, toServerErrorResponse } from "@/app/api/reports/_shared";
import { runDeveloperEffectivenessRollupsForUtcDay } from "@/lib/services/analytics/effectiveness-rollups";
import { startOfUtcDay } from "@/lib/services/analytics/utc-day";
import { resolveReportScope } from "@/lib/services/reports/scope";
import type { RetrospectiveFilters } from "@/lib/services/reports/types";

export async function POST(request: NextRequest) {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  try {
    const body = (await request.json().catch(() => ({}))) as { date?: string };
    const day = body.date ? startOfUtcDay(new Date(body.date)) : startOfUtcDay(new Date());
    const companyId = request.nextUrl.searchParams.get("companyId") ?? undefined;
    const scope = await resolveReportScope(user, {
      companyId,
      integrationType: "asana",
      workspaceId: "_",
      periodMode: "date_range",
      teamMemberIds: null,
    } as RetrospectiveFilters);
    const result = await runDeveloperEffectivenessRollupsForUtcDay(scope.companyIds, day);
    return NextResponse.json({ ok: true, day: day.toISOString(), ...result });
  } catch (error) {
    return toServerErrorResponse(error);
  }
}
