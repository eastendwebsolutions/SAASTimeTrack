import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { and, eq } from "drizzle-orm";
import { canManagePokerPlanning } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { ppSessions, ppWorkspaceAdmins } from "@/lib/db/schema";

export async function requirePokerUser() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requirePokerAdmin() {
  const user = await requirePokerUser();
  const assignment = await db.query.ppWorkspaceAdmins.findFirst({
    where: and(eq(ppWorkspaceAdmins.companyId, user.companyId), eq(ppWorkspaceAdmins.userId, user.id)),
  });
  if (!canManagePokerPlanning(user.role, Boolean(assignment))) {
    throw new Error("Forbidden");
  }
  return user;
}

export async function requirePokerAdminForWorkspace(workspaceId: string) {
  const user = await requirePokerUser();
  if (user.role === "super_admin") {
    return user;
  }
  const assignment = await db.query.ppWorkspaceAdmins.findFirst({
    where: and(
      eq(ppWorkspaceAdmins.companyId, user.companyId),
      eq(ppWorkspaceAdmins.userId, user.id),
      eq(ppWorkspaceAdmins.asanaWorkspaceId, workspaceId),
    ),
  });
  if (!assignment) {
    throw new Error("Forbidden");
  }
  return user;
}

export async function requirePokerAdminForSession(sessionId: string) {
  const user = await requirePokerUser();
  const session = await db.query.ppSessions.findFirst({
    where: and(eq(ppSessions.id, sessionId), eq(ppSessions.companyId, user.companyId)),
    columns: {
      asanaWorkspaceId: true,
    },
  });
  if (!session) {
    throw new Error("Forbidden");
  }
  if (user.role === "super_admin") {
    return user;
  }
  if (!session.asanaWorkspaceId) {
    throw new Error("Forbidden");
  }
  const assignment = await db.query.ppWorkspaceAdmins.findFirst({
    where: and(
      eq(ppWorkspaceAdmins.companyId, user.companyId),
      eq(ppWorkspaceAdmins.userId, user.id),
      eq(ppWorkspaceAdmins.asanaWorkspaceId, session.asanaWorkspaceId),
    ),
  });
  if (!assignment) {
    throw new Error("Forbidden");
  }
  return user;
}

export async function hasAnyPokerWorkspaceAdminAccess(userId: string, companyId: string) {
  const assignment = await db.query.ppWorkspaceAdmins.findFirst({
    where: and(eq(ppWorkspaceAdmins.companyId, companyId), eq(ppWorkspaceAdmins.userId, userId)),
  });
  return Boolean(assignment);
}
