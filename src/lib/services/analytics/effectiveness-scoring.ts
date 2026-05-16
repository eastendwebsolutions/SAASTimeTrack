export const DEFAULT_EFFECTIVENESS_WEIGHTS = {
  taskCompletionRate: 0.25,
  storyPointCompletion: 0.15,
  estimateAccuracy: 0.15,
  aiAdoptionConsistency: 0.1,
  acceptedAiCompletions: 0.1,
  reopenedTaskReduction: 0.1,
  timesheetConsistency: 0.1,
  aiAssistedCodeContribution: 0.05,
} as const;

export type EffectivenessWeights = Record<keyof typeof DEFAULT_EFFECTIVENESS_WEIGHTS, number>;

export function normalizeWeights(input: Partial<Record<string, number>> | null | undefined): EffectivenessWeights {
  const keys = Object.keys(DEFAULT_EFFECTIVENESS_WEIGHTS) as (keyof EffectivenessWeights)[];
  const merged: Partial<EffectivenessWeights> = {};
  let sum = 0;
  for (const k of keys) {
    const v = typeof input?.[k] === "number" && Number.isFinite(input[k] as number) ? (input[k] as number) : DEFAULT_EFFECTIVENESS_WEIGHTS[k];
    merged[k] = Math.max(0, v);
    sum += merged[k]!;
  }
  if (sum <= 0) return { ...DEFAULT_EFFECTIVENESS_WEIGHTS };
  const out = {} as EffectivenessWeights;
  for (const k of keys) {
    out[k] = (merged[k]! / sum) as EffectivenessWeights[typeof k];
  }
  return out;
}

export function effectivenessBandFromScore(score: number): {
  band: "needs_improvement" | "developing" | "strong_contributor" | "ai_power_user";
  label: string;
} {
  if (score >= 80) return { band: "ai_power_user", label: "AI Power User" };
  if (score >= 60) return { band: "strong_contributor", label: "Strong Contributor" };
  if (score >= 40) return { band: "developing", label: "Developing" };
  return { band: "needs_improvement", label: "Needs Improvement" };
}

export type RawEffectivenessInputs = {
  /** 0–1 portion of assigned tasks completed in period */
  taskCompletionRate: number | null;
  /** 0–1 portion of planned story points delivered */
  storyPointCompletion: number | null;
  /** 0–1 where 1 = perfect estimate vs actual */
  estimateAccuracy: number | null;
  /** 0–1 active Cursor days / business days */
  aiAdoptionConsistency: number | null;
  /** 0–1 accepted / total AI completions */
  acceptedAiCompletions: number | null;
  /** 0–1 lower reopened rate is better — pass as (1 - reopenedRate) */
  reopenedTaskReduction: number | null;
  /** 0–1 timesheet submission / logging consistency */
  timesheetConsistency: number | null;
  /** 0–1 AI lines / total lines */
  aiAssistedCodeContribution: number | null;
};

function clamp01(n: number | null | undefined, neutral = 0.5): number {
  if (n === null || n === undefined || Number.isNaN(n)) return neutral;
  return Math.min(1, Math.max(0, n));
}

/** Map a 0–1 input to 0–100 component score. */
function toComponentScore(value: number | null | undefined, neutral = 0.5): number {
  return Math.round(clamp01(value, neutral) * 100);
}

export function computeDeliveryEffectivenessScore(
  raw: RawEffectivenessInputs,
  weights: EffectivenessWeights,
): { score: number; components: Record<string, number> } {
  const components = {
    taskCompletionRate: toComponentScore(raw.taskCompletionRate, 0),
    storyPointCompletion: toComponentScore(raw.storyPointCompletion, 0),
    estimateAccuracy: toComponentScore(raw.estimateAccuracy, 0.5),
    aiAdoptionConsistency: toComponentScore(raw.aiAdoptionConsistency, 0),
    acceptedAiCompletions: toComponentScore(raw.acceptedAiCompletions, 0),
    reopenedTaskReduction: toComponentScore(raw.reopenedTaskReduction, 0.5),
    timesheetConsistency: toComponentScore(raw.timesheetConsistency, 0),
    aiAssistedCodeContribution: toComponentScore(raw.aiAssistedCodeContribution, 0),
  };

  let score = 0;
  for (const k of Object.keys(weights) as (keyof EffectivenessWeights)[]) {
    score += components[k] * weights[k];
  }

  return { score: Math.round(Math.min(100, Math.max(0, score))), components };
}

export function computeAiAdoptionScore(raw: {
  acceptanceRate: number | null;
  activeDayRatio: number | null;
  aiCodeShare: number | null;
}): number {
  const a = toComponentScore(raw.acceptanceRate, 0);
  const b = toComponentScore(raw.activeDayRatio, 0);
  const c = toComponentScore(raw.aiCodeShare, 0);
  return Math.round((a * 0.45 + b * 0.35 + c * 0.2));
}
