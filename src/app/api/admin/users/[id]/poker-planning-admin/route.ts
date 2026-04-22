import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { isSuperAdmin } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { ppWorkspaceAdmins, users } from "@/lib/db/schema";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const actor = await getOrCreateCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSuperAdmin(actor.role)) {
    return NextResponse.json({ error: "Super admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const payload = await request.formData();
  const enabled = payload.get("enabled") === "1";
  const workspaceId = String(payload.get("workspaceId") ?? "").trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      id: true,
      companyId: true,
    },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (enabled) {
    await db
      .insert(ppWorkspaceAdmins)
      .values({
        companyId: target.companyId,
        userId: target.id,
        asanaWorkspaceId: workspaceId,
        createdByUserId: actor.id,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(ppWorkspaceAdmins)
      .where(
        and(
          eq(ppWorkspaceAdmins.companyId, target.companyId),
          eq(ppWorkspaceAdmins.userId, target.id),
          eq(ppWorkspaceAdmins.asanaWorkspaceId, workspaceId),
        ),
      );
  }

  return NextResponse.redirect(new URL("/admin/review", request.url));
}
