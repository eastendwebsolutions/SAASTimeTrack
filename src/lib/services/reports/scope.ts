import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import type { RetrospectiveFilters, ReportScope } from "@/lib/services/reports/types";

export function resolveReportScope(currentUser: {
  id: string;
  companyId: string;
  role: "user" | "company_admin" | "super_admin";
}, filters: RetrospectiveFilters): ReportScope {
  if (currentUser.role === "super_admin") {
    return {
      companyId: filters.companyId ?? currentUser.companyId,
      role: currentUser.role,
    };
  }

  if (currentUser.role === "company_admin") {
    return {
      companyId: currentUser.companyId,
      role: currentUser.role,
    };
  }

  return {
    companyId: currentUser.companyId,
    lockedUserId: currentUser.id,
    role: currentUser.role,
  };
}

export async function resolveScopedTeamMembers(scope: ReportScope, requestedUserIds: string[] | null) {
  if (scope.lockedUserId) return [scope.lockedUserId];
  if (!requestedUserIds || requestedUserIds.length === 0) {
    const companyUsers = await db.query.users.findMany({
      where: (table, { eq }) => eq(table.companyId, scope.companyId),
      columns: { id: true },
    });
    return companyUsers.map((user) => user.id);
  }

  const allowed = await db.query.users.findMany({
    where: (table, { and, eq }) => and(eq(table.companyId, scope.companyId), inArray(table.id, requestedUserIds)),
    columns: { id: true },
  });
  return allowed.map((user) => user.id);
}
