import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { timeEntries, timesheets } from "@/lib/db/schema";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user || !canReviewEntries(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [sheet] = await db
    .update(timesheets)
    .set({ status: "approved", approvedBy: user.id, approvedAt: new Date() })
    .where(isSuperAdmin(user.role) ? eq(timesheets.id, id) : and(eq(timesheets.id, id), eq(timesheets.companyId, user.companyId)))
    .returning();

  if (!sheet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .update(timeEntries)
    .set({ status: "approved", approvedBy: user.id, approvedAt: new Date() })
    .where(eq(timeEntries.timesheetId, id));

  return NextResponse.redirect(new URL("/admin/review", request.url));
}
