import { and, eq, gte, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { syncActualPointsForEntryTarget } from "@/lib/services/asana-actual-points";
import { getWeekBounds } from "@/lib/services/week";
import { getDurationMinutes, timeEntryPayloadSchema } from "@/lib/validation/time-entry";
import { assertProjectTaskOwnedByUser } from "@/lib/validation/time-entry-ownership";

function parseEntryDateLocal(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const localDate = new Date(year, monthIndex, day, 0, 0, 0, 0);

  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== monthIndex ||
    localDate.getDate() !== day
  ) {
    return null;
  }

  return localDate;
}

export async function GET(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekStart = request.nextUrl.searchParams.get("weekStart");
  const bounds = getWeekBounds(weekStart ? new Date(weekStart) : new Date());

  const entries = await db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.userId, user.id),
      gte(timeEntries.entryDate, bounds.start),
      lte(timeEntries.entryDate, bounds.end),
    ),
  });

  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";
  let parsedPayload: unknown;

  if (contentType.includes("application/json")) {
    parsedPayload = await request.json();
  } else {
    const formData = await request.formData();
    parsedPayload = {
      projectId: formData.get("projectId"),
      taskId: formData.get("taskId"),
      subtaskId: formData.get("subtaskId"),
      entryDate: formData.get("entryDate"),
      timeIn: formData.get("timeIn"),
      timeOut: formData.get("timeOut"),
      summary: formData.get("summary"),
    };
  }

  const payload = timeEntryPayloadSchema.parse(parsedPayload);
  const durationMinutes = getDurationMinutes(payload.timeIn, payload.timeOut);
  const entryDate = parseEntryDateLocal(payload.entryDate);
  if (!entryDate) {
    return NextResponse.json({ error: "Invalid entry date" }, { status: 400 });
  }

  try {
    await assertProjectTaskOwnedByUser({
      ownerUserId: user.id,
      projectId: payload.projectId,
      taskId: payload.taskId,
      subtaskId: payload.subtaskId,
    });
  } catch {
    return NextResponse.json({ error: "Invalid project or task for your account" }, { status: 403 });
  }

  const [entry] = await db
    .insert(timeEntries)
    .values({
      companyId: user.companyId,
      userId: user.id,
      projectId: payload.projectId,
      taskId: payload.taskId,
      subtaskId: payload.subtaskId || null,
      entryDate,
      timeIn: new Date(payload.timeIn),
      timeOut: new Date(payload.timeOut),
      durationMinutes,
      summary: payload.summary,
      status: "draft",
    })
    .returning();

  await syncActualPointsForEntryTarget({
    companyId: user.companyId,
    projectId: payload.projectId,
    taskId: payload.taskId,
    subtaskId: payload.subtaskId || null,
  });

  if (contentType.includes("application/json")) {
    return NextResponse.json(entry, { status: 201 });
  }

  return NextResponse.redirect(new URL("/timesheet", request.url));
}
