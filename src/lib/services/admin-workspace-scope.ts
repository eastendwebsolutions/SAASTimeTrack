import { eq } from "drizzle-orm";
import type { Role } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";

/** Company ids visible to a company admin (workspace-linked companies or own company). */
export async function resolveWorkspaceCompanyIdsForCompanyAdmin(companyId: string) {
  const actorCompany = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { id: true, asanaWorkspaceId: true },
  });

  if (!actorCompany?.asanaWorkspaceId) {
    return [companyId];
  }

  const linked = await db.query.companies.findMany({
    where: eq(companies.asanaWorkspaceId, actorCompany.asanaWorkspaceId),
    columns: { id: true },
  });

  return linked.map((row) => row.id);
}

export type AdminWorkspaceActor = {
  id: string;
  companyId: string;
  role: Role;
};
