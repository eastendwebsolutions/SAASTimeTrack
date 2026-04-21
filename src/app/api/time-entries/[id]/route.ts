import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companySettings, timeEntries } from "@/lib/db/schema";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { syncActualPointsForEntryTarget } from "@/lib/services/asana-actual-points";
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
