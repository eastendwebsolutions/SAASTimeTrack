import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/db/schema";
import { logAuditChanges } from "@/lib/services/audit-log";
import { setClerkAccessEnabled } from "@/lib/services/clerk-admin";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const actor = await getOrCreateCurrentUser();
  if (!actor || !canReviewEntries(actor.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const payload = await request.formData();
  const enabled = payload.get("enabled") === "1";

  const target = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      id: true,
      companyId: true,
      role: true,
      clerkUserId: true,
    },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (target.role === "super_admin") {
    return NextResponse.json({ error: "Cannot revoke super admin access" }, { status: 403 });
  }

  await setClerkAccessEnabled(target.clerkUserId, enabled);

  await logAuditChanges([
    {
      companyId: target.companyId,
      actorUserId: actor.id,
      pageKey: "admin_review",
      entityType: "user_access",
      entityId: target.id,
      fieldName: "SAASTimeTrack Access",
      beforeValue: enabled ? "Revoked" : "Enabled",
      afterValue: enabled ? "Enabled" : "Revoked",
      metadataJson: { targetUserId: target.id, clerkUserId: target.clerkUserId },
    },
  ]);

  return NextResponse.redirect(new URL("/admin/review", request.url));
}
