import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOrCreateCurrentUser();
  if (!user || !canReviewEntries(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await db
    .update(timeEntries)
    .set({ status: "approved", approvedBy: user.id, approvedAt: new Date() })
    .where(isSuperAdmin(user.role) ? eq(timeEntries.id, id) : and(eq(timeEntries.id, id), eq(timeEntries.companyId, user.companyId)));

  return NextResponse.redirect(new URL("/admin/review", request.url));
}
