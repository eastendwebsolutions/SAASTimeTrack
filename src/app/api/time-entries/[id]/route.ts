import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companySettings, timeEntries } from "@/lib/db/schema";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { syncActualPointsForEntryTarget } from "@/lib/services/asana-actual-points";
import { logAuditChanges } from "@/lib/services/audit-log";
import { getWeekBounds } from "@/lib/services/week";
import { getDurationMinutes } from "@/lib/validation/time-entry";
import { assertProjectTaskOwnedByUser } from "@/lib/validation/time-entry-ownership";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as {
    summary?: string;
    entryDate?: string;
    timeIn?: string;
    timeOut?: string;
    projectId?: string;
    taskId?: string;
    subtaskId?: string | null;
  };
  const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (entry.companyId !== user.companyId && !isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = entry.userId === user.id;
  const isReviewer = canReviewEntries(user.role) && (entry.companyId === user.companyId || isSuperAdmin(user.role));
  if (!isOwner && !isReviewer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (entry.lockedAt) {
    const settings = await db.query.companySettings.findFirst({
      where: eq(companySettings.companyId, entry.companyId),
    });
    if (!(canReviewEntries(user.role) && settings?.allowAdminOverrideLockedEntries)) {
      return NextResponse.json({ error: "Entry is locked" }, { status: 403 });
    }
  }

  const nextTimeIn = body.timeIn ? new Date(body.timeIn) : new Date(entry.timeIn);
  const nextTimeOut = body.timeOut ? new Date(body.timeOut) : new Date(entry.timeOut);
  const durationMinutes =
    body.timeIn || body.timeOut ? getDurationMinutes(nextTimeIn.toISOString(), nextTimeOut.toISOString()) : entry.durationMinutes;

  const nextProjectId = body.projectId ?? entry.projectId;
  const nextTaskId = body.taskId ?? entry.taskId;
  const nextSubtaskId = body.subtaskId === undefined ? entry.subtaskId : body.subtaskId || null;
  const previousTarget = {
    companyId: entry.companyId,
    projectId: entry.projectId,
    taskId: entry.taskId,
    subtaskId: entry.subtaskId,
  };

  if (body.projectId || body.taskId || body.subtaskId !== undefined) {
    try {
      await assertProjectTaskOwnedByUser({
        ownerUserId: entry.userId,
        projectId: nextProjectId,
        taskId: nextTaskId,
        subtaskId: nextSubtaskId,
      });
    } catch {
      return NextResponse.json({ error: "Invalid project or task for this entry's owner" }, { status: 403 });
    }
  }

  const [updated] = await db
    .update(timeEntries)
    .set({
      summary: body.summary ?? entry.summary,
      entryDate: body.entryDate ? new Date(body.entryDate) : entry.entryDate,
      timeIn: nextTimeIn,
      timeOut: nextTimeOut,
      durationMinutes,
      projectId: nextProjectId,
      taskId: nextTaskId,
      subtaskId: nextSubtaskId,
    })
    .where(
      isSuperAdmin(user.role)
        ? eq(timeEntries.id, id)
        : and(eq(timeEntries.id, id), eq(timeEntries.companyId, user.companyId)),
    )
    .returning();

  const bounds = getWeekBounds(new Date(updated.entryDate));
  const contextKey = `${updated.userId}:${bounds.start.toISOString()}`;
  const pageKey = isReviewer && !isOwner ? "admin_timesheet_detail" : "timesheet_weekly";
  await logAuditChanges([
    {
      companyId: updated.companyId,
      actorUserId: user.id,
      pageKey,
      contextKey,
      entityType: "time_entry",
      entityId: updated.id,
      fieldName: "Summary",
      beforeValue: entry.summary,
      afterValue: updated.summary,
    },
    {
      companyId: updated.companyId,
      actorUserId: user.id,
      pageKey,
      contextKey,
      entityType: "time_entry",
      entityId: updated.id,
      fieldName: "Entry date",
      beforeValue: new Date(entry.entryDate).toISOString(),
      afterValue: new Date(updated.entryDate).toISOString(),
    },
    {
      companyId: updated.companyId,
      actorUserId: user.id,
      pageKey,
      contextKey,
      entityType: "time_entry",
      entityId: updated.id,
      fieldName: "Time in",
      beforeValue: new Date(entry.timeIn).toISOString(),
      afterValue: new Date(updated.timeIn).toISOString(),
    },
    {
      companyId: updated.companyId,
      actorUserId: user.id,
      pageKey,
      contextKey,
      entityType: "time_entry",
      entityId: updated.id,
      fieldName: "Time out",
      beforeValue: new Date(entry.timeOut).toISOString(),
      afterValue: new Date(updated.timeOut).toISOString(),
    },
    {
      companyId: updated.companyId,
      actorUserId: user.id,
      pageKey,
      contextKey,
      entityType: "time_entry",
      entityId: updated.id,
      fieldName: "Project ID",
      beforeValue: entry.projectId,
      afterValue: updated.projectId,
    },
    {
      companyId: updated.companyId,
      actorUserId: user.id,
      pageKey,
      contextKey,
      entityType: "time_entry",
      entityId: updated.id,
      fieldName: "Task ID",
      beforeValue: entry.taskId,
      afterValue: updated.taskId,
    },
    {
      companyId: updated.companyId,
      actorUserId: user.id,
      pageKey,
      contextKey,
      entityType: "time_entry",
      entityId: updated.id,
      fieldName: "Subtask ID",
      beforeValue: entry.subtaskId,
      afterValue: updated.subtaskId,
    },
  ]);

  const nextTarget = {
    companyId: updated.companyId,
    projectId: nextProjectId,
    taskId: nextTaskId,
    subtaskId: nextSubtaskId,
  };
  await syncActualPointsForEntryTarget(nextTarget);
  if (
    previousTarget.projectId !== nextTarget.projectId ||
    previousTarget.taskId !== nextTarget.taskId ||
    previousTarget.subtaskId !== nextTarget.subtaskId
  ) {
    await syncActualPointsForEntryTarget(previousTarget);
  }

  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
  if (!entry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (entry.companyId !== user.companyId && !isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (entry.userId !== user.id && !isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (entry.lockedAt) {
    return NextResponse.json({ error: "Entry is locked" }, { status: 403 });
  }

  const bounds = getWeekBounds(new Date(entry.entryDate));
  await logAuditChanges([
    {
      companyId: entry.companyId,
      actorUserId: user.id,
      pageKey: "timesheet_weekly",
      contextKey: `${entry.userId}:${bounds.start.toISOString()}`,
      entityType: "time_entry",
      entityId: entry.id,
      fieldName: "Entry status",
      beforeValue: "draft",
      afterValue: "deleted",
    },
    {
      companyId: entry.companyId,
      actorUserId: user.id,
      pageKey: "timesheet_weekly",
      contextKey: `${entry.userId}:${bounds.start.toISOString()}`,
      entityType: "time_entry",
      entityId: entry.id,
      fieldName: "Summary",
      beforeValue: entry.summary,
      afterValue: null,
    },
  ]);

  await db.delete(timeEntries).where(
    isSuperAdmin(user.role)
      ? eq(timeEntries.id, id)
      : and(eq(timeEntries.id, id), eq(timeEntries.companyId, user.companyId)),
  );

  await syncActualPointsForEntryTarget({
    companyId: entry.companyId,
    projectId: entry.projectId,
    taskId: entry.taskId,
    subtaskId: entry.subtaskId,
  });
  return NextResponse.json({ ok: true });
}
