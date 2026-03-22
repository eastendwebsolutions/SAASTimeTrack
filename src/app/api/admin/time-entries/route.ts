import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user || !canReviewEntries(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entries = await db.query.timeEntries.findMany({
    where: isSuperAdmin(user.role)
      ? eq(timeEntries.status, "submitted")
      : and(eq(timeEntries.companyId, user.companyId), eq(timeEntries.status, "submitted")),
  });

  return NextResponse.json(entries);
}
