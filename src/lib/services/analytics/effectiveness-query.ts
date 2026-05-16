import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cursorUsageDaily,
  scoreWeightProfiles,
  taskDeliveryMetricsDaily,
  timesheetDeliveryMetricsDaily,
} from "@/lib/db/schema";
import { isMissingIntegrationSchemaError } from "@/lib/integrations/schema-compat";
import {
  computeAiAdoptionScore,
  computeDeliveryEffectivenessScore,
  DEFAULT_EFFECTIVENESS_WEIGHTS,
  effectivenessBandFromScore,
  normalizeWeights,
  type EffectivenessWeights,
  type RawEffectivenessInputs,
} from "@/lib/services/analytics/effectiveness-scoring";
import { startOfUtcDay } from "@/lib/services/analytics/utc-day";
import { buildDateRangeComparisonPeriods } from "@/lib/services/reports/period-comparison";
import { getScopedDataset, getRetrospectiveFiltersData, resolvePeriodFromFilters } from "@/lib/services/reports/retrospective-query";
import { resolveReportScope, resolveScopedTeamMembers } from "@/lib/services/reports/scope";
import type { DeveloperEffectivenessFilters } from "@/lib/services/reports/types";

type CursorAgg = {
  totalRequests: number;
  acceptedCompletions: number;
  aiLinesAdded: number;
  manualLinesAdded: number;
  daysWithUsage: number;
};

type ScopedRow = {
  userId: string;
  userEmail: string;
  userDisplayName: string | null;
  reportingJobRole: string | null;
  entryDate: Date;
  durationMinutes: number | null;
  estimateHours: unknown;
  storyPoints: unknown;
  actualPoints: unknown;
  completedAt: Date | null;
  externalTaskId: string | null;
  taskStatus: string | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function loadWeightsForCompany(companyId: string): Promise<EffectivenessWeights> {
  const companyProfile = await db.query.scoreWeightProfiles.findFirst({
    where: and(eq(scoreWeightProfiles.companyId, companyId), eq(scoreWeightProfiles.isDefault, true)),
  });
  if (companyProfile?.weightsJson && typeof companyProfile.weightsJson === "object") {
    return normalizeWeights(companyProfile.weightsJson as Record<string, number>);
  }
  const globalProfile = await db.query.scoreWeightProfiles.findFirst({
    where: and(sql`${scoreWeightProfiles.companyId} is null`, eq(scoreWeightProfiles.isDefault, true)),
  });
  if (globalProfile?.weightsJson && typeof globalProfile.weightsJson === "object") {
    return normalizeWeights(globalProfile.weightsJson as Record<string, number>);
  }
  return { ...DEFAULT_EFFECTIVENESS_WEIGHTS };
}

async function cursorAggregatesForUsers(
  companyIds: string[],
  userIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, CursorAgg>> {
  const map = new Map<string, CursorAgg>();
  if (userIds.length === 0) return map;
  try {
    const rows = await db
      .select({
        userId: cursorUsageDaily.userId,
        totalRequests: sql<number>`coalesce(sum(${cursorUsageDaily.totalRequests}), 0)::int`.mapWith(Number),
        acceptedCompletions: sql<number>`coalesce(sum(${cursorUsageDaily.acceptedCompletions}), 0)::int`.mapWith(Number),
        aiLinesAdded: sql<number>`coalesce(sum(${cursorUsageDaily.aiLinesAdded}), 0)::int`.mapWith(Number),
        manualLinesAdded: sql<number>`coalesce(sum(${cursorUsageDaily.manualLinesAdded}), 0)::int`.mapWith(Number),
        daysWithUsage: sql<number>`count(distinct ${cursorUsageDaily.usageDate})::int`.mapWith(Number),
      })
      .from(cursorUsageDaily)
      .where(
        and(
          inArray(cursorUsageDaily.companyId, companyIds),
          inArray(cursorUsageDaily.userId, userIds),
          gte(cursorUsageDaily.usageDate, startOfUtcDay(start)),
          lte(cursorUsageDaily.usageDate, startOfUtcDay(end)),
        ),
      )
      .groupBy(cursorUsageDaily.userId);
    for (const r of rows) {
      map.set(r.userId, {
        totalRequests: r.totalRequests,
        acceptedCompletions: r.acceptedCompletions,
        aiLinesAdded: r.aiLinesAdded,
        manualLinesAdded: r.manualLinesAdded,
        daysWithUsage: r.daysWithUsage,
      });
    }
  } catch (e) {
    if (!isMissingIntegrationSchemaError(e)) throw e;
  }
  return map;
}

async function taskMetricsForUsers(
  companyIds: string[],
  integrationType: DeveloperEffectivenessFilters["integrationType"],
  workspaceId: string,
  userIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, { tasksCompleted: number; tasksReopened: number; storyPoints: number }>> {
  const map = new Map<string, { tasksCompleted: number; tasksReopened: number; storyPoints: number }>();
  if (userIds.length === 0) return map;
  try {
    const rows = await db
      .select({
        userId: taskDeliveryMetricsDaily.assigneeUserId,
        tasksCompleted: sql<number>`coalesce(sum(${taskDeliveryMetricsDaily.tasksCompleted}), 0)::int`.mapWith(Number),
        tasksReopened: sql<number>`coalesce(sum(${taskDeliveryMetricsDaily.tasksReopened}), 0)::int`.mapWith(Number),
        storyPoints: sql<string>`coalesce(sum(${taskDeliveryMetricsDaily.storyPointsCompleted}), 0)`.mapWith(String),
      })
      .from(taskDeliveryMetricsDaily)
      .where(
        and(
          inArray(taskDeliveryMetricsDaily.companyId, companyIds),
          eq(taskDeliveryMetricsDaily.integrationType, integrationType),
          eq(taskDeliveryMetricsDaily.externalWorkspaceId, workspaceId),
          inArray(taskDeliveryMetricsDaily.assigneeUserId, userIds),
          gte(taskDeliveryMetricsDaily.metricDate, startOfUtcDay(start)),
          lte(taskDeliveryMetricsDaily.metricDate, startOfUtcDay(end)),
        ),
      )
      .groupBy(taskDeliveryMetricsDaily.assigneeUserId);
    for (const r of rows) {
      map.set(r.userId, {
        tasksCompleted: r.tasksCompleted,
        tasksReopened: r.tasksReopened,
        storyPoints: Number(r.storyPoints) || 0,
      });
    }
  } catch (e) {
    if (!isMissingIntegrationSchemaError(e)) throw e;
  }
  return map;
}

async function timesheetConsistencyForUsers(
  companyIds: string[],
  userIds: string[],
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) return map;
  try {
    const rows = await db
      .select({
        userId: timesheetDeliveryMetricsDaily.userId,
        daysLogged: sql<number>`count(*) filter (where ${timesheetDeliveryMetricsDaily.entryCount} > 0)::int`.mapWith(Number),
        daysSubmitted: sql<number>`count(*) filter (where ${timesheetDeliveryMetricsDaily.timesheetSubmittedForWeek})::int`.mapWith(Number),
        totalDays: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(timesheetDeliveryMetricsDaily)
      .where(
        and(
          inArray(timesheetDeliveryMetricsDaily.companyId, companyIds),
          inArray(timesheetDeliveryMetricsDaily.userId, userIds),
          gte(timesheetDeliveryMetricsDaily.metricDate, startOfUtcDay(start)),
          lte(timesheetDeliveryMetricsDaily.metricDate, startOfUtcDay(end)),
        ),
      )
      .groupBy(timesheetDeliveryMetricsDaily.userId);
    const span = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1);
    for (const r of rows) {
      const ratio = r.totalDays > 0 ? (r.daysLogged / span) * 0.6 + (r.daysSubmitted / span) * 0.4 : 0;
      map.set(r.userId, Math.min(1, ratio));
    }
  } catch (e) {
    if (!isMissingIntegrationSchemaError(e)) throw e;
  }
  return map;
}

export type UserEffectivenessMetrics = {
  userId: string;
  displayName: string;
  email: string;
  reportingJobRole: string | null;
  tasksCompleted: number;
  tasksReopened: number;
  storyPointsCompleted: number;
  loggedHours: number;
  estimateAccuracy: number | null;
  deliveryScore: number;
  aiAdoptionScore: number;
  band: ReturnType<typeof effectivenessBandFromScore>;
  acceptanceRate: number | null;
  aiCodeShare: number | null;
  hoursPerStoryPoint: number | null;
  sprintCompletionPct: number | null;
  reopenedTaskPct: number | null;
  lastActiveAt: string | null;
};

function buildUserMetrics(
  rows: ScopedRow[],
  weights: EffectivenessWeights,
  cursorByUser: Map<string, CursorAgg>,
  taskByUser: Map<string, { tasksCompleted: number; tasksReopened: number; storyPoints: number }>,
  tsConsistency: Map<string, number>,
  periodDays: number,
): UserEffectivenessMetrics[] {
  type Acc = UserEffectivenessMetrics & { _taskKeys: Set<string>; _completedKeys: Set<string>; _last: Date | null };
  const byUser = new Map<string, Acc>();

  for (const row of rows) {
    let m = byUser.get(row.userId);
    if (!m) {
      m = {
        userId: row.userId,
        displayName: row.userDisplayName ?? row.userEmail.split("@")[0],
        email: row.userEmail,
        reportingJobRole: row.reportingJobRole,
        tasksCompleted: 0,
        tasksReopened: 0,
        storyPointsCompleted: 0,
        loggedHours: 0,
        estimateAccuracy: null,
        deliveryScore: 0,
        aiAdoptionScore: 0,
        band: effectivenessBandFromScore(0),
        acceptanceRate: null,
        aiCodeShare: null,
        hoursPerStoryPoint: null,
        sprintCompletionPct: null,
        reopenedTaskPct: null,
        lastActiveAt: null,
        _taskKeys: new Set(),
        _completedKeys: new Set(),
        _last: null,
      };
      byUser.set(row.userId, m);
    }
    const minutes = Number(row.durationMinutes ?? 0);
    m.loggedHours += minutes / 60;
    if (row.externalTaskId) m._taskKeys.add(row.externalTaskId);
    if (row.completedAt && row.externalTaskId) m._completedKeys.add(row.externalTaskId);
    if (!m._last || row.entryDate > m._last) m._last = row.entryDate;
  }

  for (const [uid, m] of byUser) {
    const c = cursorByUser.get(uid);
    const t = taskByUser.get(uid);
    m.tasksCompleted = t?.tasksCompleted ?? m._completedKeys.size;
    m.tasksReopened = t?.tasksReopened ?? 0;
    m.storyPointsCompleted = t?.storyPoints ?? 0;

    const workedTasks = Math.max(1, m._taskKeys.size);
    const taskCompletionRate = m.tasksCompleted / workedTasks;
    const storyPointCompletion = m.storyPointsCompleted > 0 ? Math.min(1, m.storyPointsCompleted / (m.storyPointsCompleted + 5)) : 0;

    let estAcc: number | null = null;
    let estSum = 0;
    let estN = 0;
    for (const row of rows) {
      if (row.userId !== uid) continue;
      const est = num(row.estimateHours);
      if (est === null || est <= 0) continue;
      const minutes = Number(row.durationMinutes ?? 0);
      const actual = minutes / 60;
      const err = Math.abs(est - actual) / est;
      estSum += 1 - Math.min(1, err);
      estN += 1;
    }
    if (estN > 0) estAcc = estSum / estN;

    const reopenedRate = m.tasksCompleted + m.tasksReopened > 0 ? m.tasksReopened / (m.tasksCompleted + m.tasksReopened) : 0;
    const reopenedTaskReduction = 1 - Math.min(1, reopenedRate * 2);

    const acceptanceRate =
      c && c.totalRequests > 0 ? Math.min(1, c.acceptedCompletions / c.totalRequests) : c && c.acceptedCompletions > 0 ? 1 : null;
    const totalLines = (c?.aiLinesAdded ?? 0) + (c?.manualLinesAdded ?? 0);
    const aiCodeShare = totalLines > 0 ? (c?.aiLinesAdded ?? 0) / totalLines : null;
    const activeDayRatio = periodDays > 0 ? Math.min(1, (c?.daysWithUsage ?? 0) / periodDays) : 0;

    const raw: RawEffectivenessInputs = {
      taskCompletionRate,
      storyPointCompletion,
      estimateAccuracy: estAcc,
      aiAdoptionConsistency: activeDayRatio,
      acceptedAiCompletions: acceptanceRate,
      reopenedTaskReduction,
      timesheetConsistency: tsConsistency.get(uid) ?? null,
      aiAssistedCodeContribution: aiCodeShare,
    };

    const { score: deliveryScore } = computeDeliveryEffectivenessScore(raw, weights);
    const aiAdoptionScore = computeAiAdoptionScore({
      acceptanceRate,
      activeDayRatio,
      aiCodeShare,
    });

    m.deliveryScore = deliveryScore;
    m.aiAdoptionScore = aiAdoptionScore;
    m.band = effectivenessBandFromScore(deliveryScore);
    m.estimateAccuracy = estAcc;
    m.acceptanceRate = acceptanceRate;
    m.aiCodeShare = aiCodeShare;
    m.hoursPerStoryPoint = m.storyPointsCompleted > 0 ? m.loggedHours / m.storyPointsCompleted : null;
    m.sprintCompletionPct = workedTasks > 0 ? (m.tasksCompleted / workedTasks) * 100 : null;
    m.reopenedTaskPct = m.tasksCompleted + m.tasksReopened > 0 ? (m.tasksReopened / (m.tasksCompleted + m.tasksReopened)) * 100 : null;
    m.lastActiveAt = m._last ? m._last.toISOString() : null;
  }

  return [...byUser.values()].map((row) => {
    const { _taskKeys, _completedKeys, _last, ...rest } = row;
    void _taskKeys;
    void _completedKeys;
    void _last;
    return rest;
  });
}

async function computeMetricsForFilters(
  currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" },
  filters: DeveloperEffectivenessFilters,
): Promise<{ metrics: UserEffectivenessMetrics[]; period: { start: Date; end: Date }; scopeCompanyId: string }> {
  const { scope, period, rows } = await getScopedDataset(currentUser, filters);
  const scopedRows = rows as unknown as ScopedRow[];
  const scopedUserIds = await resolveScopedTeamMembers(scope, filters.teamMemberIds);
  const periodMs = period.end.getTime() - period.start.getTime();
  const periodDays = Math.max(1, Math.ceil(periodMs / 86400000) + 1);
  const weights = await loadWeightsForCompany(scope.companyId);

  const [cursorByUser, taskByUser, tsMap] = await Promise.all([
    cursorAggregatesForUsers(scope.companyIds, scopedUserIds, period.start, period.end),
    taskMetricsForUsers(
      scope.companyIds,
      filters.integrationType,
      filters.workspaceId,
      scopedUserIds,
      period.start,
      period.end,
    ),
    timesheetConsistencyForUsers(scope.companyIds, scopedUserIds, period.start, period.end),
  ]);

  let metrics = buildUserMetrics(scopedRows, weights, cursorByUser, taskByUser, tsMap, periodDays);
  if (filters.reportingJobRole) {
    metrics = metrics.filter((m) => (m.reportingJobRole ?? "").toLowerCase() === filters.reportingJobRole!.toLowerCase());
  }
  if (filters.adoptionScoreMin !== undefined && !Number.isNaN(filters.adoptionScoreMin)) {
    metrics = metrics.filter((m) => m.aiAdoptionScore >= filters.adoptionScoreMin!);
  }
  if (filters.deliveryScoreMin !== undefined && !Number.isNaN(filters.deliveryScoreMin)) {
    metrics = metrics.filter((m) => m.deliveryScore >= filters.deliveryScoreMin!);
  }

  return { metrics, period, scopeCompanyId: scope.companyId };
}

export async function getDeveloperEffectivenessFiltersData(
  currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" },
  selectedCompanyId?: string,
) {
  const base = await getRetrospectiveFiltersData(currentUser, selectedCompanyId);
  const companyId = selectedCompanyId ?? currentUser.companyId;
  let weightProfiles: { id: string; name: string; isDefault: boolean; companyId: string | null }[] = [];
  try {
    weightProfiles = await db.query.scoreWeightProfiles.findMany({
      where: or(eq(scoreWeightProfiles.companyId, companyId), sql`${scoreWeightProfiles.companyId} is null`),
      columns: { id: true, name: true, isDefault: true, companyId: true },
      orderBy: (t, { asc: a }) => [a(t.name)],
    });
  } catch (e) {
    if (!isMissingIntegrationSchemaError(e)) throw e;
  }
  return {
    ...base,
    weightProfiles,
    datePresets: ["current_sprint", "previous_sprint", "last_7", "last_30", "last_90", "custom"] as const,
    tooltips: {
      deliveryScore: "Weighted blend of task throughput, estimate calibration, AI usage quality, timesheet discipline, and rework signals.",
      aiAdoptionScore: "Blend of AI acceptance rate, active Cursor usage days, and AI-assisted code share.",
    },
  };
}

function avg(nums: number[]) {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function getDeveloperEffectivenessSummary(
  currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" },
  filters: DeveloperEffectivenessFilters,
) {
  const { metrics, period } = await computeMetricsForFilters(currentUser, filters);
  const periods = buildDateRangeComparisonPeriods(period.start, period.end);
  const prev = periods.length > 1 ? periods[periods.length - 2] : null;
  let prevMetrics: UserEffectivenessMetrics[] = [];
  if (prev) {
    const prevFilters = {
      ...filters,
      periodMode: "date_range" as const,
      startDate: prev.start,
      endDate: prev.end,
    };
    prevMetrics = (await computeMetricsForFilters(currentUser, prevFilters)).metrics;
  }

  const cur = metrics;
  const activeAiDevelopers = cur.filter((m) => (m.acceptanceRate ?? 0) > 0 || (m.aiCodeShare ?? 0) > 0).length;
  const aiAdoptionPct = avg(cur.map((m) => m.aiAdoptionScore)) / 100;
  const sprintCompletionPct = avg(cur.map((m) => m.sprintCompletionPct ?? 0));
  const estimateAccuracyPct = avg(cur.map((m) => (m.estimateAccuracy ?? 0) * 100));
  const storyPoints = cur.reduce((s, m) => s + m.storyPointsCompleted, 0);
  const hoursPerSpVals = cur.map((m) => m.hoursPerStoryPoint).filter((v): v is number => v != null && !Number.isNaN(v));
  const hoursPerSp =
    hoursPerSpVals.length > 0 ? hoursPerSpVals.reduce((s, m) => s + m, 0) / hoursPerSpVals.length : null;
  const taskClosure = avg(cur.map((m) => (m.tasksCompleted > 0 ? m.tasksCompleted / Math.max(1, m.tasksCompleted + m.tasksReopened) : 0)));
  const acceptance = avg(cur.map((m) => (m.acceptanceRate ?? 0) * 100));
  const aiCode = avg(cur.map((m) => (m.aiCodeShare ?? 0) * 100));
  const deliveryEff = avg(cur.map((m) => m.deliveryScore));

  const pickPrev = (fn: (m: UserEffectivenessMetrics) => number) =>
    prevMetrics.length ? avg(prevMetrics.map(fn)) : null;

  return {
    period: { start: period.start.toISOString(), end: period.end.toISOString() },
    cards: [
      {
        key: "active_ai_developers",
        label: "Active AI Developers",
        value: activeAiDevelopers,
        prev: pickPrev((m) => ((m.acceptanceRate ?? 0) > 0 || (m.aiCodeShare ?? 0) > 0 ? 1 : 0)),
        tooltip: "Team members with measurable Cursor AI usage in the selected period.",
      },
      {
        key: "ai_adoption_pct",
        label: "AI adoption (avg score)",
        value: Math.round(aiAdoptionPct * 1000) / 10,
        prev: pickPrev((m) => m.aiAdoptionScore),
        tooltip: "Average AI adoption score (0–100) across included members.",
      },
      {
        key: "sprint_completion_pct",
        label: "Sprint-style completion",
        value: Math.round(sprintCompletionPct * 10) / 10,
        prev: pickPrev((m) => m.sprintCompletionPct ?? 0),
        tooltip: "Heuristic completion intensity from tasks touched in the period.",
      },
      {
        key: "estimate_accuracy",
        label: "Avg estimate accuracy",
        value: Math.round(estimateAccuracyPct * 10) / 10,
        prev: pickPrev((m) => (m.estimateAccuracy ?? 0) * 100),
        tooltip: "Higher means logged time tracked closer to task estimates.",
      },
      {
        key: "story_points",
        label: "Story points completed",
        value: storyPoints,
        prev: pickPrev((m) => m.storyPointsCompleted),
        tooltip: "Sum of story points on tasks completed in the rollup window (when synced).",
      },
      {
        key: "hours_per_point",
        label: "Avg hours / story point",
        value: hoursPerSp != null && !Number.isNaN(hoursPerSp) ? Math.round(hoursPerSp * 100) / 100 : null,
        prev: pickPrev((m) => m.hoursPerStoryPoint ?? 0),
        tooltip: "Logged development hours divided by completed story points.",
      },
      {
        key: "task_closure",
        label: "Task closure consistency",
        value: Math.round(taskClosure * 1000) / 10,
        prev: pickPrev((m) => (m.tasksCompleted > 0 ? m.tasksCompleted / Math.max(1, m.tasksCompleted + m.tasksReopened) : 0)),
        tooltip: "Share of completed work vs reopened signals in the rollup window.",
      },
      {
        key: "ai_acceptance",
        label: "Avg AI acceptance %",
        value: Math.round(acceptance * 10) / 10,
        prev: pickPrev((m) => (m.acceptanceRate ?? 0) * 100),
        tooltip: "Accepted AI completions divided by total AI requests (Cursor analytics).",
      },
      {
        key: "ai_code_pct",
        label: "Avg AI-assisted code %",
        value: Math.round(aiCode * 10) / 10,
        prev: pickPrev((m) => (m.aiCodeShare ?? 0) * 100),
        tooltip: "Estimated AI-generated lines vs AI + manual lines (Cursor analytics).",
      },
      {
        key: "delivery_efficiency",
        label: "Avg delivery efficiency score",
        value: Math.round(deliveryEff * 10) / 10,
        prev: pickPrev((m) => m.deliveryScore),
        tooltip: "Configurable weighted delivery effectiveness score (0–100).",
      },
    ],
  };
}

export async function getDeveloperEffectivenessQuadrant(
  currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" },
  filters: DeveloperEffectivenessFilters,
) {
  const { metrics } = await computeMetricsForFilters(currentUser, filters);
  return {
    points: metrics.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      x: m.aiAdoptionScore,
      y: m.deliveryScore,
      band: m.band.band,
      bandLabel: m.band.label,
      lastActive: m.lastActiveAt,
    })),
  };
}

export async function getDeveloperEffectivenessTable(
  currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" },
  filters: DeveloperEffectivenessFilters,
) {
  const { metrics } = await computeMetricsForFilters(currentUser, filters);
  const sortKey = filters.tableSort ?? "deliveryScore";
  const dir = filters.tableSortDir === "asc" ? 1 : -1;
  const sorted = [...metrics].sort((a, b) => {
    const va = (a as unknown as Record<string, number | string | null>)[sortKey];
    const vb = (b as unknown as Record<string, number | string | null>)[sortKey];
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
  });
  return { rows: sorted };
}

export async function getDeveloperEffectivenessUserDetail(
  currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" },
  targetUserId: string,
  filters: DeveloperEffectivenessFilters,
) {
  const scoped = await resolveScopedTeamMembers(await resolveReportScope(currentUser, filters), filters.teamMemberIds);
  if (!scoped.includes(targetUserId)) {
    throw new Error("Forbidden");
  }
  const { metrics, period } = await computeMetricsForFilters(currentUser, filters);
  const user = metrics.find((m) => m.userId === targetUserId);
  if (!user) throw new Error("Not found");
  const teamAvgDelivery = avg(metrics.map((m) => m.deliveryScore));
  const teamAvgAi = avg(metrics.map((m) => m.aiAdoptionScore));
  return {
    user,
    period: { start: period.start.toISOString(), end: period.end.toISOString() },
    comparison: {
      teamAvgDelivery,
      teamAvgAi,
    },
    strengths: user.deliveryScore >= teamAvgDelivery ? ["Delivery score at or above team average"] : [],
    weaknesses: user.deliveryScore < teamAvgDelivery ? ["Delivery score below team average"] : [],
    trendDirection: user.deliveryScore >= 60 ? "positive" : "watch",
  };
}

export async function getDeveloperEffectivenessTrends(
  currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" },
  filters: DeveloperEffectivenessFilters,
  _overlay: "none" | "team" | "company",
) {
  const scope = await resolveReportScope(currentUser, filters);
  const period = await resolvePeriodFromFilters(scope.companyIds, filters);
  const periods = buildDateRangeComparisonPeriods(period.start, period.end).slice(-5);
  const series: { key: string; label: string; points: { date: string; value: number }[] }[] = [];
  for (const p of periods) {
    const subFilters: DeveloperEffectivenessFilters = {
      ...filters,
      periodMode: "date_range",
      startDate: p.start,
      endDate: p.end,
    };
    const { metrics } = await computeMetricsForFilters(currentUser, subFilters);
    const label = p.label;
    const delivery = avg(metrics.map((m) => m.deliveryScore));
    series.push({
      key: `delivery_${p.key}`,
      label: `${label} · delivery`,
      points: [{ date: p.end.toISOString(), value: delivery }],
    });
    series.push({
      key: `ai_${p.key}`,
      label: `${label} · AI adoption`,
      points: [{ date: p.end.toISOString(), value: avg(metrics.map((m) => m.aiAdoptionScore)) }],
    });
  }
  return { series, overlay: _overlay };
}
