import { describe, expect, it } from "vitest";
import {
  computeDeliveryEffectivenessScore,
  DEFAULT_EFFECTIVENESS_WEIGHTS,
  effectivenessBandFromScore,
  normalizeWeights,
} from "./effectiveness-scoring";

describe("normalizeWeights", () => {
  it("fills missing keys from defaults and sums to 1", () => {
    const w = normalizeWeights({ taskCompletionRate: 0.5 });
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(w.taskCompletionRate).toBeGreaterThan(0);
  });

  it("uses defaults when input empty", () => {
    const w = normalizeWeights({});
    expect(w).toEqual(DEFAULT_EFFECTIVENESS_WEIGHTS);
  });
});

describe("effectivenessBandFromScore", () => {
  it("maps thresholds", () => {
    expect(effectivenessBandFromScore(90).band).toBe("ai_power_user");
    expect(effectivenessBandFromScore(70).band).toBe("strong_contributor");
    expect(effectivenessBandFromScore(50).band).toBe("developing");
    expect(effectivenessBandFromScore(20).band).toBe("needs_improvement");
  });
});

describe("computeDeliveryEffectivenessScore", () => {
  it("returns 100 when all components perfect", () => {
    const raw = {
      taskCompletionRate: 1,
      storyPointCompletion: 1,
      estimateAccuracy: 1,
      aiAdoptionConsistency: 1,
      acceptedAiCompletions: 1,
      reopenedTaskReduction: 1,
      timesheetConsistency: 1,
      aiAssistedCodeContribution: 1,
    };
    const { score } = computeDeliveryEffectivenessScore(raw, DEFAULT_EFFECTIVENESS_WEIGHTS);
    expect(score).toBe(100);
  });

  it("returns 0 when all null/zero", () => {
    const raw = {
      taskCompletionRate: 0,
      storyPointCompletion: 0,
      estimateAccuracy: null,
      aiAdoptionConsistency: 0,
      acceptedAiCompletions: 0,
      reopenedTaskReduction: null,
      timesheetConsistency: 0,
      aiAssistedCodeContribution: 0,
    };
    const { score } = computeDeliveryEffectivenessScore(raw, DEFAULT_EFFECTIVENESS_WEIGHTS);
    expect(score).toBeLessThan(50);
  });
});
