import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companySettings, timeEntries } from "@/lib/db/schema";
import { canReviewEntries } from "@/lib/auth/rbac";
import { getDurationMinutes } from "@/lib/validation/time-entry";

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
  if (!entry || entry.companyId !== user.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (entry.lockedAt) {
    const settings = await db.query.companySettings.findFirst({ where: eq(companySettings.companyId, user.companyId) });
    if (!(canReviewEntries(user.role) && settings?.allowAdminOverrideLockedEntries)) {
      return NextResponse.json({ error: "Entry is locked" }, { status: 403 });
    }
  }

  const nextTimeIn = body.timeIn ? new Date(body.timeIn) : new Date(entry.timeIn);
  const nextTimeOut = body.timeOut ? new Date(body.timeOut) : new Date(entry.timeOut);
  const durationMinutes =
    body.timeIn || body.timeOut ? getDurationMinutes(nextTimeIn.toISOString(), nextTimeOut.toISOString()) : entry.durationMinutes;

  const [updated] = await db
    .update(timeEntries)
    .set({
      summary: body.summary ?? entry.summary,
      entryDate: body.entryDate ? new Date(body.entryDate) : entry.entryDate,
      timeIn: nextTimeIn,
      timeOut: nextTimeOut,
      durationMinutes,
      projectId: body.projectId ?? entry.projectId,
      taskId: body.taskId ?? entry.taskId,
      subtaskId: body.subtaskId === undefined ? entry.subtaskId : body.subtaskId || null,
    })
    .where(and(eq(timeEntries.id, id), eq(timeEntries.companyId, user.companyId)))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const entry = await db.query.timeEntries.findFirst({ where: eq(timeEntries.id, id) });
  if (!entry || entry.companyId !== user.companyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (entry.lockedAt) {
    return NextResponse.json({ error: "Entry is locked" }, { status: 403 });
  }

  await db.delete(timeEntries).where(and(eq(timeEntries.id, id), eq(timeEntries.companyId, user.companyId)));
  return NextResponse.json({ ok: true });
}
