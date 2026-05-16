import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  reportingTasks,
  taskDeliverySnapshots,
  taskDeliveryMetricsDaily,
  timesheetDeliveryMetricsDaily,
  timeEntries,
  timesheets,
  teamStatusEvents,
} from "@/lib/db/schema";
import type { IntegrationProvider } from "@/lib/integrations/provider";
import { startOfUtcDay } from "@/lib/services/analytics/utc-day";
import { getWeekBounds } from "@/lib/services/week";

/**
 * Capture end-of-day snapshots of reporting_tasks for reopened / aging metrics.
 * Idempotent per (company, integration, workspace, task, day).
 */
export async function captureTaskDeliverySnapshotsForUtcDay(companyIds: string[], utcDay: Date) {
  const day = startOfUtcDay(utcDay);
  const rows = await db.query.reportingTasks.findMany({
    where: inArray(reportingTasks.companyId, companyIds),
    columns: {
      companyId: true,
      integrationType: true,
      externalWorkspaceId: true,
      externalTaskId: true,
      taskStatus: true,
      completedAt: true,
      assigneeUserId: true,
      storyPoints: true,
    },
  });

  if (rows.length === 0) return { inserted: 0 };

  const chunks = chunkArray(rows, 200);
  let inserted = 0;
  for (const chunk of chunks) {
    await db
      .insert(taskDeliverySnapshots)
      .values(
        chunk.map((row) => ({
          companyId: row.companyId,
          integrationType: row.integrationType,
          externalWorkspaceId: row.externalWorkspaceId,
          externalTaskId: row.externalTaskId,
          snapshotDate: day,
          taskStatus: row.taskStatus,
          completedAt: row.completedAt,
          assigneeUserId: row.assigneeUserId,
          storyPoints: row.storyPoints,
        })),
      )
      .onConflictDoUpdate({
        target: [
          taskDeliverySnapshots.companyId,
          taskDeliverySnapshots.integrationType,
          taskDeliverySnapshots.externalWorkspaceId,
          taskDeliverySnapshots.externalTaskId,
          taskDeliverySnapshots.snapshotDate,
        ],
        set: {
          taskStatus: sql`excluded.task_status`,
          completedAt: sql`excluded.completed_at`,
          assigneeUserId: sql`excluded.assignee_user_id`,
          storyPoints: sql`excluded.story_points`,
          capturedAt: sql`now()`,
        },
      });
    inserted += chunk.length;
  }

  return { inserted };
}

/**
 * Roll up per-assignee delivery metrics for a UTC calendar day from reporting_tasks.
 */
export async function rollupTaskDeliveryMetricsDaily(companyIds: string[], utcDay: Date) {
  const day = startOfUtcDay(utcDay);
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      companyId: reportingTasks.companyId,
      integrationType: reportingTasks.integrationType,
      externalWorkspaceId: reportingTasks.externalWorkspaceId,
      assigneeUserId: reportingTasks.assigneeUserId,
      tasksCompleted: sql<number>`count(*) filter (where ${reportingTasks.completedAt} is not null and ${reportingTasks.completedAt} >= ${day} and ${reportingTasks.completedAt} < ${next})`.mapWith(Number),
      storyPointsCompleted: sql<string>`coalesce(sum(${reportingTasks.storyPoints}) filter (where ${reportingTasks.completedAt} is not null and ${reportingTasks.completedAt} >= ${day} and ${reportingTasks.completedAt} < ${next}), 0)`.mapWith(String),
      tasksActiveEndOfDay: sql<number>`count(*) filter (where (${reportingTasks.taskStatus} is null or lower(${reportingTasks.taskStatus}) not like '%complete%') and (${reportingTasks.completedAt} is null or ${reportingTasks.completedAt} >= ${next}))`.mapWith(Number),
    })
    .from(reportingTasks)
    .where(
      and(
        inArray(reportingTasks.companyId, companyIds),
        sql`${reportingTasks.assigneeUserId} is not null`,
      ),
    )
    .groupBy(
      reportingTasks.companyId,
      reportingTasks.integrationType,
      reportingTasks.externalWorkspaceId,
      reportingTasks.assigneeUserId,
    );

  let upserted = 0;
  for (const row of rows) {
    if (!row.assigneeUserId) continue;
    const prevDay = new Date(day.getTime() - 24 * 60 * 60 * 1000);
    const reopened = await countReopenedTasksForUserDaySimple({
      companyId: row.companyId,
      integrationType: row.integrationType,
      workspaceId: row.externalWorkspaceId,
      assigneeUserId: row.assigneeUserId,
      metricDay: day,
      prevDay,
    });
    await db
      .insert(taskDeliveryMetricsDaily)
      .values({
        companyId: row.companyId,
        integrationType: row.integrationType,
        externalWorkspaceId: row.externalWorkspaceId,
        assigneeUserId: row.assigneeUserId,
        metricDate: day,
        tasksCompleted: row.tasksCompleted,
        tasksReopened: reopened,
        storyPointsCompleted: row.storyPointsCompleted,
        tasksActiveEndOfDay: row.tasksActiveEndOfDay,
      })
      .onConflictDoUpdate({
        target: [
          taskDeliveryMetricsDaily.companyId,
          taskDeliveryMetricsDaily.integrationType,
          taskDeliveryMetricsDaily.externalWorkspaceId,
          taskDeliveryMetricsDaily.assigneeUserId,
          taskDeliveryMetricsDaily.metricDate,
        ],
        set: {
          tasksCompleted: sql`excluded.tasks_completed`,
          tasksReopened: sql`excluded.tasks_reopened`,
          storyPointsCompleted: sql`excluded.story_points_completed`,
          tasksActiveEndOfDay: sql`excluded.tasks_active_end_of_day`,
          computedAt: sql`now()`,
          updatedAt: sql`now()`,
        },
      });
    upserted += 1;
  }

  return { upserted };
}

async function countReopenedTasksForUserDaySimple(args: {
  companyId: string;
  integrationType: IntegrationProvider;
  workspaceId: string;
  assigneeUserId: string;
  metricDay: Date;
  prevDay: Date;
}) {
  const todaySnaps = await db.query.taskDeliverySnapshots.findMany({
    where: and(
      eq(taskDeliverySnapshots.companyId, args.companyId),
      eq(taskDeliverySnapshots.integrationType, args.integrationType),
      eq(taskDeliverySnapshots.externalWorkspaceId, args.workspaceId),
      eq(taskDeliverySnapshots.assigneeUserId, args.assigneeUserId),
      eq(taskDeliverySnapshots.snapshotDate, args.metricDay),
    ),
    columns: { externalTaskId: true, completedAt: true, taskStatus: true },
  });
  const yestSnaps = await db.query.taskDeliverySnapshots.findMany({
    where: and(
      eq(taskDeliverySnapshots.companyId, args.companyId),
      eq(taskDeliverySnapshots.integrationType, args.integrationType),
      eq(taskDeliverySnapshots.externalWorkspaceId, args.workspaceId),
      eq(taskDeliverySnapshots.assigneeUserId, args.assigneeUserId),
      eq(taskDeliverySnapshots.snapshotDate, args.prevDay),
    ),
    columns: { externalTaskId: true, completedAt: true, taskStatus: true },
  });
  const yMap = new Map(yestSnaps.map((y) => [y.externalTaskId, y]));
  let reopened = 0;
  for (const t of todaySnaps) {
    const y = yMap.get(t.externalTaskId);
    if (!y?.completedAt) continue;
    if (!t.completedAt) reopened += 1;
  }
  return reopened;
}
export async function rollupTimesheetDeliveryMetricsDaily(companyIds: string[], utcDay: Date) {
  const day = startOfUtcDay(utcDay);
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);

  const timeRows = await db
    .select({
      companyId: timeEntries.companyId,
      userId: timeEntries.userId,
      loggedDevMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`.mapWith(Number),
      entryCount: sql<number>`count(*)::int`.mapWith(Number),
      approvedEntryCount: sql<number>`count(*) filter (where ${timeEntries.status} = 'approved')::int`.mapWith(Number),
    })
    .from(timeEntries)
    .where(
      and(inArray(timeEntries.companyId, companyIds), gte(timeEntries.entryDate, day), lt(timeEntries.entryDate, next)),
    )
    .groupBy(timeEntries.companyId, timeEntries.userId);

  let upserted = 0;
  for (const row of timeRows) {
    const breakMinutes = await estimateBreakMinutesForUserDay(row.companyId, row.userId, day);
    const { start: weekStart } = getWeekBounds(day);
    const ts = await db.query.timesheets.findFirst({
      where: and(
        eq(timesheets.userId, row.userId),
        eq(timesheets.weekStart, weekStart),
        eq(timesheets.companyId, row.companyId),
      ),
      columns: { status: true },
    });
    const submitted = ts?.status === "submitted" || ts?.status === "approved";

    await db
      .insert(timesheetDeliveryMetricsDaily)
      .values({
        companyId: row.companyId,
        userId: row.userId,
        metricDate: day,
        loggedDevMinutes: row.loggedDevMinutes,
        entryCount: row.entryCount,
        approvedEntryCount: row.approvedEntryCount,
        breakMinutesEstimate: breakMinutes,
        timesheetSubmittedForWeek: submitted,
      })
      .onConflictDoUpdate({
        target: [
          timesheetDeliveryMetricsDaily.companyId,
          timesheetDeliveryMetricsDaily.userId,
          timesheetDeliveryMetricsDaily.metricDate,
        ],
        set: {
          loggedDevMinutes: sql`excluded.logged_dev_minutes`,
          entryCount: sql`excluded.entry_count`,
          approvedEntryCount: sql`excluded.approved_entry_count`,
          breakMinutesEstimate: sql`excluded.break_minutes_estimate`,
          timesheetSubmittedForWeek: sql`excluded.timesheet_submitted_for_week`,
          computedAt: sql`now()`,
          updatedAt: sql`now()`,
        },
      });
    upserted += 1;
  }

  return { upserted };
}

export async function runDeveloperEffectivenessRollupsForUtcDay(companyIds: string[], utcDay: Date) {
  const snap = await captureTaskDeliverySnapshotsForUtcDay(companyIds, utcDay);
  const taskM = await rollupTaskDeliveryMetricsDaily(companyIds, utcDay);
  const tsM = await rollupTimesheetDeliveryMetricsDaily(companyIds, utcDay);
  return { snapshots: snap, taskMetrics: taskM, timesheetMetrics: tsM };
}

async function estimateBreakMinutesForUserDay(companyId: string, userId: string, localDay: Date) {
  const next = new Date(localDay.getTime() + 24 * 60 * 60 * 1000);
  const events = await db.query.teamStatusEvents.findMany({
    where: and(
      eq(teamStatusEvents.companyId, companyId),
      eq(teamStatusEvents.userId, userId),
      gte(teamStatusEvents.eventLocalDate, localDay),
      lt(teamStatusEvents.eventLocalDate, next),
    ),
    columns: { eventType: true, eventTimestampUtc: true },
    orderBy: (t, { asc: a }) => [a(t.eventTimestampUtc)],
  });
  let breakMs = 0;
  let breakIn: Date | null = null;
  for (const ev of events) {
    if (ev.eventType === "BREAK_IN") {
      breakIn = ev.eventTimestampUtc;
    } else if (ev.eventType === "BREAK_OUT" && breakIn) {
      breakMs += ev.eventTimestampUtc.getTime() - breakIn.getTime();
      breakIn = null;
    }
  }
  return Math.round(breakMs / 60000);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}
