import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { adminNotifications, timeEntries, timesheets, users } from "@/lib/db/schema";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getWeekBounds } from "@/lib/services/week";

export async function POST(request: NextRequest, { params }: { params: Promise<{ weekStart: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { weekStart } = await params;
  const bounds = getWeekBounds(new Date(weekStart));
  const submittedAt = new Date();
  const submittedFromIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const [sheet] = await db
    .insert(timesheets)
    .values({
      companyId: user.companyId,
      userId: user.id,
      weekStart: bounds.start,
      status: "submitted",
      submittedAt,
      submittedFromIp,
    })
    .onConflictDoUpdate({
      target: [timesheets.userId, timesheets.weekStart],
      set: { status: "submitted", submittedAt, submittedFromIp },
    })
    .returning();

  await db
    .update(timeEntries)
    .set({ status: "submitted", lockedAt: submittedAt, timesheetId: sheet.id })
    .where(and(eq(timeEntries.userId, user.id), gte(timeEntries.entryDate, bounds.start), lte(timeEntries.entryDate, bounds.end)));

  const adminUsers = await db.query.users.findMany({
    where: and(eq(users.companyId, user.companyId), inArray(users.role, ["company_admin", "super_admin"])),
  });
  if (adminUsers.length) {
    await db.insert(adminNotifications).values(
      adminUsers.map((adminUser) => ({
        companyId: user.companyId,
        recipientUserId: adminUser.id,
        type: "timesheet_submitted",
        title: "Timesheet submitted",
        body: `A user submitted a timesheet on ${submittedAt.toLocaleString("en-US")} from ${submittedFromIp}.`,
        timesheetId: sheet.id,
      })),
    );
  }

  return NextResponse.redirect(new URL("/timesheet", request.url));
}
