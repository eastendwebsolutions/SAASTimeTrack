import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

type AllowedManagedRole = "user" | "company_admin";

function parseRole(value: FormDataEntryValue | null): AllowedManagedRole | null {
  if (value === "user" || value === "company_admin") return value;
  return null;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getOrCreateCurrentUser();
  if (!actor || !canReviewEntries(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const target = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!isSuperAdmin(actor.role) && target.companyId !== actor.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const nextRole = parseRole(formData.get("role"));
  if (!nextRole) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (target.role === "super_admin") {
    return NextResponse.json({ error: "Cannot modify super admin role" }, { status: 403 });
  }

  if (!isSuperAdmin(actor.role) && nextRole !== "user" && nextRole !== "company_admin") {
    return NextResponse.json({ error: "Forbidden role assignment" }, { status: 403 });
  }

  await db
    .update(users)
    .set({ role: nextRole })
    .where(
      isSuperAdmin(actor.role)
        ? eq(users.id, target.id)
        : and(eq(users.id, target.id), eq(users.companyId, actor.companyId)),
    );

  return NextResponse.redirect(new URL("/admin/review", request.url));
}
