import { NextResponse } from "next/server";
import { requireDeveloperEffectivenessAdmin } from "@/app/api/reports/_shared";
import { AiEngineeringAnalysisEngine } from "@/lib/services/analytics/ai-insights/engine";

export async function GET() {
  const { user, response } = await requireDeveloperEffectivenessAdmin();
  if (!user) return response!;

  const engine = new AiEngineeringAnalysisEngine();
  const result = await engine.generateTeamSummary({
    companyId: user.companyId,
    periodStartIso: new Date().toISOString(),
    periodEndIso: new Date().toISOString(),
    metricsSummaryJson: {},
  });

  return NextResponse.json(
    {
      phase: 2,
      ...result,
      policy: {
        tone: "operational",
        avoid: ["punitive labels", "emotion inference", "intent inference", "personal attributes"],
        explainability: "Each future summary will include provenance_json with metric keys and confidence.",
      },
    },
    { status: 501 },
  );
}
