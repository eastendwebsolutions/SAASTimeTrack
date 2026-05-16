import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { adminReviewRedirect } from "@/lib/admin/review-notice";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/db/schema";
import { logAuditChanges } from "@/lib/services/audit-log";

type AllowedManagedRole = "user" | "company_admin";

function parseRole(value: FormDataEntryValue | null): AllowedManagedRole | null {
  if (value === "user" || value === "company_admin") return value;
  return null;
}

function formatRole(role: string) {
  return role.replaceAll("_", " ");
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getOrCreateCurrentUser();
  if (!actor || !canReviewEntries(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const target = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      id: true,
      companyId: true,
      role: true,
      email: true,
    },
  });
  if (!target) {
    return adminReviewRedirect(request.url, { type: "error", message: "User not found." });
  }

  if (!isSuperAdmin(actor.role)) {
    const [actorCompany, targetCompany] = await Promise.all([
      db.query.companies.findFirst({
        where: eq(companies.id, actor.companyId),
        columns: { asanaWorkspaceId: true },
      }),
      db.query.companies.findFirst({
        where: eq(companies.id, target.companyId),
        columns: { asanaWorkspaceId: true },
      }),
    ]);
    const sameWorkspace = Boolean(
      actorCompany?.asanaWorkspaceId &&
        targetCompany?.asanaWorkspaceId &&
        actorCompany.asanaWorkspaceId === targetCompany.asanaWorkspaceId,
    );
    if (!sameWorkspace && target.companyId !== actor.companyId) {
      return adminReviewRedirect(request.url, { type: "error", message: "You cannot manage users outside your workspace." });
    }
  }

  const formData = await request.formData();
  const nextRole = parseRole(formData.get("role"));
  if (!nextRole) {
    return adminReviewRedirect(request.url, { type: "error", message: "Invalid role selected." });
  }

  if (target.role === "super_admin") {
    return adminReviewRedirect(request.url, { type: "error", message: "Super admin roles cannot be changed here." });
  }

  if (!isSuperAdmin(actor.role) && nextRole !== "user" && nextRole !== "company_admin") {
    return adminReviewRedirect(request.url, { type: "error", message: "You cannot assign that role." });
  }

  const beforeRole = target.role;
  if (beforeRole === nextRole) {
    return adminReviewRedirect(request.url, {
      type: "success",
      message: `No change: ${target.email} is already ${formatRole(nextRole)}.`,
    });
  }

  await db
    .update(users)
    .set({ role: nextRole })
    .where(
      isSuperAdmin(actor.role)
        ? eq(users.id, target.id)
        : and(eq(users.id, target.id), eq(users.companyId, actor.companyId)),
    );

  await logAuditChanges([
    {
      companyId: target.companyId,
      actorUserId: actor.id,
      pageKey: "admin_review",
      entityType: "user_role",
      entityId: target.id,
      fieldName: "App Role",
      beforeValue: formatRole(beforeRole),
      afterValue: formatRole(nextRole),
      metadataJson: { targetUserId: target.id, targetEmail: target.email },
    },
  ]);

  return adminReviewRedirect(request.url, {
    type: "success",
    message: `Updated app role for ${target.email} to ${formatRole(nextRole)}.`,
  });
}
