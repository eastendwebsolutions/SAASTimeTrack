/**
 * Phase 2 — AI Engineering Analysis Engine (stub).
 * Generates operational summaries from aggregated metrics; no LLM calls in MVP.
 */
export type InsightInput = {
  companyId: string;
  periodStartIso: string;
  periodEndIso: string;
  metricsSummaryJson: Record<string, unknown>;
};

export type InsightResult = {
  status: "not_implemented";
  message: string;
};

export class AiEngineeringAnalysisEngine {
  async generateTeamSummary(input: InsightInput): Promise<InsightResult> {
    const { companyId, periodStartIso, periodEndIso, metricsSummaryJson } = input;
    void companyId;
    void periodStartIso;
    void periodEndIso;
    void metricsSummaryJson;
    return {
      status: "not_implemented",
      message: "AI summaries are planned for Phase 2. Use charts and tables for now.",
    };
  }
}
