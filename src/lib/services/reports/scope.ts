import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import type { RetrospectiveFilters, ReportScope } from "@/lib/services/reports/types";
import { resolveWorkspaceScopedCompanyIdsForSuperAdmin } from "@/lib/services/workspace-options";

export async function resolveReportScope(currentUser: {
  id: string;
  companyId: string;
  role: "user" | "company_admin" | "super_admin";
}, filters: RetrospectiveFilters): Promise<ReportScope> {
  if (currentUser.role === "super_admin") {
    const companyIds = await resolveWorkspaceScopedCompanyIdsForSuperAdmin(filters.companyId ?? currentUser.companyId);
    return {
      companyId: filters.companyId ?? currentUser.companyId,
      companyIds,
      role: currentUser.role,
    };
  }

  if (currentUser.role === "company_admin") {
    return {
      companyId: currentUser.companyId,
      companyIds: [currentUser.companyId],
      role: currentUser.role,
    };
  }

  return {
    companyId: currentUser.companyId,
    companyIds: [currentUser.companyId],
    lockedUserId: currentUser.id,
    role: currentUser.role,
  };
}

export async function resolveScopedTeamMembers(scope: ReportScope, requestedUserIds: string[] | null) {
  if (scope.lockedUserId) return [scope.lockedUserId];
  if (!requestedUserIds || requestedUserIds.length === 0) {
    const companyUsers = await db.query.users.findMany({
      where: (table, { inArray: inArrayFn }) => inArrayFn(table.companyId, scope.companyIds),
      columns: { id: true },
    });
    return companyUsers.map((user) => user.id);
  }

  const allowed = await db.query.users.findMany({
    where: (table, { and, inArray: inArrayFn }) =>
      and(inArrayFn(table.companyId, scope.companyIds), inArray(table.id, requestedUserIds)),
    columns: { id: true },
  });
  return allowed.map((user) => user.id);
}
