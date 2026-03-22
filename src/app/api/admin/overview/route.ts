import { and, count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { timeEntries, users } from "@/lib/db/schema";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user || !canReviewEntries(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [teamUsers] = isSuperAdmin(user.role)
    ? await db.select({ value: count() }).from(users)
    : await db.select({ value: count() }).from(users).where(eq(users.companyId, user.companyId));
  const [submittedEntries] = isSuperAdmin(user.role)
    ? await db.select({ value: count() }).from(timeEntries).where(eq(timeEntries.status, "submitted"))
    : await db
        .select({ value: count() })
        .from(timeEntries)
        .where(and(eq(timeEntries.companyId, user.companyId), eq(timeEntries.status, "submitted")));

  return NextResponse.json({
    teamUsers: teamUsers.value,
    submittedEntries: submittedEntries.value,
  });
}
