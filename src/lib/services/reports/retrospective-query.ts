import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { reportingSprints, reportingTasks, reportingWorkspaces, timeEntries, timesheets, users } from "@/lib/db/schema";
import { buildDateRangeComparisonPeriods, coercePeriodKeyFromDate } from "@/lib/services/reports/period-comparison";
import { resolveReportScope, resolveScopedTeamMembers } from "@/lib/services/reports/scope";
import type { RetrospectiveFilters } from "@/lib/services/reports/types";

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function resolvePeriodFromFilters(companyId: string, filters: RetrospectiveFilters) {
  if (filters.periodMode === "sprint") {
    const sprint = await db.query.reportingSprints.findFirst({
      where: and(
        eq(reportingSprints.companyId, companyId),
        eq(reportingSprints.integrationType, filters.integrationType),
        eq(reportingSprints.externalWorkspaceId, filters.workspaceId),
        eq(reportingSprints.externalSprintId, filters.sprintId ?? ""),
      ),
    });
    if (!sprint) throw new Error("Sprint not found for scope");
    return { start: sprint.startDate, end: sprint.endDate, sprintName: sprint.sprintName };
  }

  if (!filters.startDate || !filters.endDate) throw new Error("Date range is required");
  return { start: filters.startDate, end: filters.endDate, sprintName: null };
}

async function getScopedDataset(currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" }, filters: RetrospectiveFilters) {
  const scope = resolveReportScope(currentUser, filters);
  const period = await resolvePeriodFromFilters(scope.companyId, filters);
  const scopedUserIds = await resolveScopedTeamMembers(scope, filters.teamMemberIds);

  if (scopedUserIds.length === 0) {
    return { scope, period, rows: [] as Array<Record<string, unknown>> };
  }

  const whereConditions = [
    eq(timeEntries.companyId, scope.companyId),
    eq(timeEntries.integrationType, filters.integrationType),
    eq(timeEntries.externalWorkspaceId, filters.workspaceId),
    gte(timeEntries.entryDate, period.start),
    lte(timeEntries.entryDate, period.end),
    inArray(timeEntries.userId, scopedUserIds),
  ];
  if (filters.projectId) {
    whereConditions.push(eq(timeEntries.externalProjectId, filters.projectId));
  }
  if (filters.taskStatus) {
    whereConditions.push(eq(reportingTasks.taskStatus, filters.taskStatus));
  }

  const rows = await db
    .select({
      userId: users.id,
      userEmail: users.email,
      entryId: timeEntries.id,
      entryDate: timeEntries.entryDate,
      timeIn: timeEntries.timeIn,
      timeOut: timeEntries.timeOut,
      durationMinutes: timeEntries.durationMinutes,
      entrySummary: timeEntries.summary,
      approvalStatus: timeEntries.status,
      externalTaskId: timeEntries.externalTaskId,
      externalSubtaskId: timeEntries.externalSubtaskId,
      taskName: reportingTasks.taskName,
      projectName: reportingTasks.projectName,
      taskStatus: reportingTasks.taskStatus,
      completedAt: reportingTasks.completedAt,
      estimateHours: reportingTasks.estimateHours,
      storyPoints: reportingTasks.storyPoints,
      actualPoints: reportingTasks.actualPoints,
      sprintId: reportingTasks.externalSprintId,
      externalProjectId: reportingTasks.externalProjectId,
      timesheetId: timeEntries.timesheetId,
      timesheetStatus: timesheets.status,
      timesheetWeek: timesheets.weekStart,
      timesheetComments: timesheets.comments,
      workspaceName: reportingWorkspaces.workspaceName,
    })
    .from(timeEntries)
    .innerJoin(users, eq(users.id, timeEntries.userId))
    .leftJoin(
      reportingTasks,
      and(
        eq(reportingTasks.companyId, timeEntries.companyId),
        eq(reportingTasks.integrationType, timeEntries.integrationType),
        eq(reportingTasks.externalWorkspaceId, timeEntries.externalWorkspaceId),
        eq(reportingTasks.externalTaskId, timeEntries.externalTaskId),
      ),
    )
    .leftJoin(
      reportingWorkspaces,
      and(
        eq(reportingWorkspaces.companyId, timeEntries.companyId),
        eq(reportingWorkspaces.integrationType, timeEntries.integrationType),
        eq(reportingWorkspaces.externalWorkspaceId, timeEntries.externalWorkspaceId),
      ),
    )
    .leftJoin(timesheets, eq(timesheets.id, timeEntries.timesheetId))
    .where(and(...whereConditions))
    .orderBy(asc(users.email), desc(timeEntries.entryDate));

  return { scope, period, rows };
}

export async function getRetrospectiveFiltersData(
  currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" },
  selectedCompanyId?: string,
) {
  const canSelectCompany = currentUser.role === "super_admin";
  const companyId = canSelectCompany ? (selectedCompanyId ?? currentUser.companyId) : currentUser.companyId;

  const [companies, workspaces, allUsers] = await Promise.all([
    canSelectCompany
      ? db.query.companies.findMany({
          columns: { id: true, name: true },
          orderBy: (table, { asc: ascFn }) => [ascFn(table.name)],
        })
      : db.query.companies.findMany({
          where: (table, { eq: eqFn }) => eqFn(table.id, companyId),
          columns: { id: true, name: true },
        }),
    db.query.reportingWorkspaces.findMany({
      where: currentUser.role === "super_admin" ? undefined : eq(reportingWorkspaces.companyId, companyId),
      columns: {
        id: true,
        companyId: true,
        integrationType: true,
        externalWorkspaceId: true,
        workspaceName: true,
      },
      orderBy: (table, { asc: ascFn }) => [ascFn(table.workspaceName)],
    }),
    db.query.users.findMany({
      where: eq(users.companyId, companyId),
      columns: { id: true, email: true },
      orderBy: (table, { asc: ascFn }) => [ascFn(table.email)],
    }),
  ]);

  return {
    companies,
    integrationTypes: ["asana", "jira", "monday"],
    workspaces,
    users: currentUser.role === "user" ? allUsers.filter((u) => u.id === currentUser.id) : allUsers,
    statuses: ["pending", "active", "completed", "archived", "draft", "submitted", "approved", "rejected"],
    role: currentUser.role,
    canManageMappings: currentUser.role === "company_admin" || currentUser.role === "super_admin",
  };
}

export async function getRetrospectiveSummary(currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" }, filters: RetrospectiveFilters) {
  const { rows } = await getScopedDataset(currentUser, filters);
  const uniqueTaskKeys = new Set<string>();
  const completedTaskKeys = new Set<string>();
  const usersIncluded = new Set<string>();

  let totalEstimatedHours = 0;
  let totalActualHours = 0;
  let totalStoryPoints = 0;
  let totalActualPoints = 0;

  for (const row of rows) {
    const durationMinutes = Number(row.durationMinutes ?? 0);
    const estimateHours = numberOrNull(row.estimateHours);
    const storyPoints = numberOrNull(row.storyPoints);
    const actualPoints = numberOrNull(row.actualPoints);
    const taskKey = String(row.externalTaskId ?? row.entryId);

    totalActualHours += durationMinutes / 60;
    if (estimateHours !== null) totalEstimatedHours += estimateHours;
    if (storyPoints !== null) totalStoryPoints += storyPoints;
    if (actualPoints !== null) totalActualPoints += actualPoints;

    uniqueTaskKeys.add(taskKey);
    if (row.completedAt) completedTaskKeys.add(taskKey);
    usersIncluded.add(String(row.userId));
  }

  const hourVariance = totalActualHours - totalEstimatedHours;
  const pointVariance = totalActualPoints - totalStoryPoints;

  return {
    totalEstimatedHours,
    totalActualHours,
    hourVariance,
    totalStoryPoints: totalStoryPoints || null,
    totalActualPoints: totalActualPoints || null,
    pointVariance: totalStoryPoints || totalActualPoints ? pointVariance : null,
    tasksWorked: uniqueTaskKeys.size,
    completedTasks: completedTaskKeys.size,
    avgActualHoursPerStoryPoint: totalStoryPoints > 0 ? totalActualHours / totalStoryPoints : null,
    usersIncluded: usersIncluded.size,
  };
}

export async function getRetrospectiveTrends(currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" }, filters: RetrospectiveFilters) {
  const scope = resolveReportScope(currentUser, filters);
  const scopedUserIds = await resolveScopedTeamMembers(scope, filters.teamMemberIds);
  if (!scopedUserIds.length) return [];

  if (filters.periodMode === "sprint") {
    const sprints = await db.query.reportingSprints.findMany({
      where: and(
        eq(reportingSprints.companyId, scope.companyId),
        eq(reportingSprints.integrationType, filters.integrationType),
        eq(reportingSprints.externalWorkspaceId, filters.workspaceId),
      ),
      orderBy: (table, { desc: descFn }) => [descFn(table.endDate)],
      limit: 50,
    });

    const selectedIndex = sprints.findIndex((sprint) => sprint.externalSprintId === filters.sprintId);
    if (selectedIndex === -1) return [];
    const selectedWindow = sprints.slice(Math.max(0, selectedIndex - 4), selectedIndex + 1).reverse();

    const trendRows = await Promise.all(
      selectedWindow.map(async (sprint) => {
        const [summary] = await db
          .select({
            actualHours: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) / 60.0, 0)`,
            estimatedHours: sql<number>`coalesce(sum(${reportingTasks.estimateHours}), 0)`,
            storyPoints: sql<number>`coalesce(sum(${reportingTasks.storyPoints}), 0)`,
            actualPoints: sql<number>`coalesce(sum(${reportingTasks.actualPoints}), 0)`,
          })
          .from(timeEntries)
          .leftJoin(
            reportingTasks,
            and(
              eq(reportingTasks.companyId, timeEntries.companyId),
              eq(reportingTasks.integrationType, timeEntries.integrationType),
              eq(reportingTasks.externalWorkspaceId, timeEntries.externalWorkspaceId),
              eq(reportingTasks.externalTaskId, timeEntries.externalTaskId),
            ),
          )
          .where(
            and(
              eq(timeEntries.companyId, scope.companyId),
              eq(timeEntries.integrationType, filters.integrationType),
              eq(timeEntries.externalWorkspaceId, filters.workspaceId),
              gte(timeEntries.entryDate, sprint.startDate),
              lte(timeEntries.entryDate, sprint.endDate),
              inArray(timeEntries.userId, scopedUserIds),
            ),
          );

        return {
          periodKey: sprint.externalSprintId,
          label: sprint.sprintName,
          estimatedHours: Number(summary?.estimatedHours ?? 0),
          actualHours: Number(summary?.actualHours ?? 0),
          storyPoints: Number(summary?.storyPoints ?? 0),
          actualPoints: Number(summary?.actualPoints ?? 0),
          isSelected: sprint.externalSprintId === filters.sprintId,
        };
      }),
    );

    return trendRows;
  }

  const period = await resolvePeriodFromFilters(scope.companyId, filters);
  const periods = buildDateRangeComparisonPeriods(period.start, period.end);
  const earliestPeriod = periods[0];
  const latestPeriod = periods[periods.length - 1];

  const rows = await db
    .select({
      entryDate: timeEntries.entryDate,
      durationMinutes: timeEntries.durationMinutes,
      estimateHours: reportingTasks.estimateHours,
      storyPoints: reportingTasks.storyPoints,
      actualPoints: reportingTasks.actualPoints,
    })
    .from(timeEntries)
    .leftJoin(
      reportingTasks,
      and(
        eq(reportingTasks.companyId, timeEntries.companyId),
        eq(reportingTasks.integrationType, timeEntries.integrationType),
        eq(reportingTasks.externalWorkspaceId, timeEntries.externalWorkspaceId),
        eq(reportingTasks.externalTaskId, timeEntries.externalTaskId),
      ),
    )
    .where(
      and(
        eq(timeEntries.companyId, scope.companyId),
        eq(timeEntries.integrationType, filters.integrationType),
        eq(timeEntries.externalWorkspaceId, filters.workspaceId),
        gte(timeEntries.entryDate, earliestPeriod.start),
        lte(timeEntries.entryDate, latestPeriod.end),
        inArray(timeEntries.userId, scopedUserIds),
      ),
    );

  const bucket = new Map<string, { estimatedHours: number; actualHours: number; storyPoints: number; actualPoints: number }>();
  for (const periodRow of periods) {
    bucket.set(periodRow.key, { estimatedHours: 0, actualHours: 0, storyPoints: 0, actualPoints: 0 });
  }

  for (const row of rows) {
    const key = coercePeriodKeyFromDate(row.entryDate, periods);
    if (!key) continue;
    const current = bucket.get(key);
    if (!current) continue;
    current.actualHours += Number(row.durationMinutes ?? 0) / 60;
    current.estimatedHours += numberOrNull(row.estimateHours) ?? 0;
    current.storyPoints += numberOrNull(row.storyPoints) ?? 0;
    current.actualPoints += numberOrNull(row.actualPoints) ?? 0;
  }

  return periods.map((periodRow) => ({
    periodKey: periodRow.key,
    label: periodRow.label,
    estimatedHours: bucket.get(periodRow.key)?.estimatedHours ?? 0,
    actualHours: bucket.get(periodRow.key)?.actualHours ?? 0,
    storyPoints: bucket.get(periodRow.key)?.storyPoints ?? 0,
    actualPoints: bucket.get(periodRow.key)?.actualPoints ?? 0,
    isSelected: periodRow.isSelected,
  }));
}

export async function getRetrospectiveTable(currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" }, filters: RetrospectiveFilters) {
  const { period, rows } = await getScopedDataset(currentUser, filters);
  const grouped = new Map<string, {
    teamMember: string;
    integration: string;
    workspace: string;
    period: string;
    tasks: Map<string, {
      project: string;
      task: string;
      subtask: string | null;
      estimatedHours: number | null;
      actualLoggedHours: number;
      storyPoints: number | null;
      actualPoints: number | null;
      varianceHours: number | null;
      variancePct: number | null;
      taskStatus: string | null;
      completionDate: string | null;
      timeEntryCount: number;
      lastTimeEntryDate: string | null;
      taskId: string | null;
    }>;
  }>();

  for (const row of rows) {
    const userKey = String(row.userId);
    const taskKey = String(row.externalTaskId ?? row.entryId);
    const email = String(row.userEmail ?? "Unknown");
    const taskName = String(row.taskName ?? "Unknown task");
    const subtaskName = row.externalSubtaskId ? String(row.externalSubtaskId) : null;

    if (!grouped.has(userKey)) {
      grouped.set(userKey, {
        teamMember: email,
        integration: String(filters.integrationType),
        workspace: String(row.workspaceName ?? filters.workspaceId),
        period: `${period.start.toISOString().slice(0, 10)} - ${period.end.toISOString().slice(0, 10)}`,
        tasks: new Map(),
      });
    }

    const userBucket = grouped.get(userKey)!;
    if (!userBucket.tasks.has(taskKey)) {
      const estimated = numberOrNull(row.estimateHours);
      const points = numberOrNull(row.storyPoints);
      const actualPoints = numberOrNull(row.actualPoints);
      userBucket.tasks.set(taskKey, {
        project: String(row.projectName ?? "N/A"),
        task: taskName,
        subtask: subtaskName,
        estimatedHours: estimated,
        actualLoggedHours: 0,
        storyPoints: points,
        actualPoints,
        varianceHours: null,
        variancePct: null,
        taskStatus: row.taskStatus ? String(row.taskStatus) : null,
        completionDate: row.completedAt ? new Date(String(row.completedAt)).toISOString() : null,
        timeEntryCount: 0,
        lastTimeEntryDate: null,
        taskId: row.externalTaskId ? String(row.externalTaskId) : null,
      });
    }

    const taskBucket = userBucket.tasks.get(taskKey)!;
    taskBucket.actualLoggedHours += Number(row.durationMinutes ?? 0) / 60;
    taskBucket.timeEntryCount += 1;
    const entryDateString = new Date(String(row.entryDate)).toISOString();
    if (!taskBucket.lastTimeEntryDate || entryDateString > taskBucket.lastTimeEntryDate) {
      taskBucket.lastTimeEntryDate = entryDateString;
    }
  }

  const userRows = Array.from(grouped.values()).map((group) => ({
    ...group,
    tasks: Array.from(group.tasks.values()).map((task) => {
      const varianceHours = task.estimatedHours === null ? null : task.actualLoggedHours - task.estimatedHours;
      const variancePct = task.estimatedHours && task.estimatedHours > 0 && varianceHours !== null
        ? (varianceHours / task.estimatedHours) * 100
        : null;
      return { ...task, varianceHours, variancePct };
    }),
  }));

  return userRows;
}

export async function getTaskTimeEntryDrilldown(
  currentUser: { id: string; companyId: string; role: "user" | "company_admin" | "super_admin" },
  filters: RetrospectiveFilters,
  taskId: string,
) {
  const { scope, period } = await getScopedDataset(currentUser, filters);
  const scopedUserIds = await resolveScopedTeamMembers(scope, filters.teamMemberIds);
  if (!scopedUserIds.length) return [];

  const rows = await db
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      date: timeEntries.entryDate,
      timeIn: timeEntries.timeIn,
      timeOut: timeEntries.timeOut,
      durationMinutes: timeEntries.durationMinutes,
      summary: timeEntries.summary,
      approvalStatus: timeEntries.status,
      timesheetWeek: timesheets.weekStart,
      timesheetStatus: timesheets.status,
      adminComments: timesheets.comments,
    })
    .from(timeEntries)
    .leftJoin(timesheets, eq(timesheets.id, timeEntries.timesheetId))
    .where(
      and(
        eq(timeEntries.companyId, scope.companyId),
        eq(timeEntries.integrationType, filters.integrationType),
        eq(timeEntries.externalWorkspaceId, filters.workspaceId),
        eq(timeEntries.externalTaskId, taskId),
        gte(timeEntries.entryDate, period.start),
        lte(timeEntries.entryDate, period.end),
        inArray(timeEntries.userId, scopedUserIds),
      ),
    )
    .orderBy(desc(timeEntries.entryDate), desc(timeEntries.timeIn));

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    date: row.date,
    timeIn: row.timeIn,
    timeOut: row.timeOut,
    durationMinutes: row.durationMinutes,
    summary: row.summary,
    approvalStatus: row.approvalStatus,
    timesheetWeek: row.timesheetWeek,
    approvedRejectedStatus: row.timesheetStatus,
    adminComments: row.adminComments,
  }));
}

export async function listProjectsForWorkspace(companyId: string, integrationType: string, workspaceId: string) {
  const projectRows = await db
    .selectDistinct({
      id: reportingTasks.externalProjectId,
      name: reportingTasks.projectName,
    })
    .from(reportingTasks)
    .where(and(
      eq(reportingTasks.companyId, companyId),
      eq(reportingTasks.integrationType, integrationType as "asana" | "jira" | "monday"),
      eq(reportingTasks.externalWorkspaceId, workspaceId),
    ))
    .orderBy(asc(reportingTasks.projectName));

  return projectRows.filter((row) => row.id).map((row) => ({ id: row.id as string, name: row.name ?? "Unnamed project" }));
}

export async function listStatusesForWorkspace(companyId: string, integrationType: string, workspaceId: string) {
  const statusRows = await db
    .selectDistinct({ status: reportingTasks.taskStatus })
    .from(reportingTasks)
    .where(and(
      eq(reportingTasks.companyId, companyId),
      eq(reportingTasks.integrationType, integrationType as "asana" | "jira" | "monday"),
      eq(reportingTasks.externalWorkspaceId, workspaceId),
    ))
    .orderBy(asc(reportingTasks.taskStatus));

  return statusRows.map((row) => row.status).filter(Boolean) as string[];
}
