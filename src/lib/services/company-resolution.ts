import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/db/schema";

/** Email domains that share one WhoSaaS company (same real-world org / Asana tenant). */
export const SHARED_COMPANY_EMAIL_DOMAINS = ["restori.io", "spartanrestoration.com"] as const;

export function emailDomain(email: string) {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function isSharedCompanyEmail(email: string) {
  const domain = emailDomain(email);
  return SHARED_COMPANY_EMAIL_DOMAINS.includes(domain as (typeof SHARED_COMPANY_EMAIL_DOMAINS)[number]);
}

/** Prefer the company row already tied to this Asana workspace. */
export async function findCompanyByAsanaWorkspaceId(asanaWorkspaceId: string) {
  return db.query.companies.findFirst({
    where: eq(companies.asanaWorkspaceId, asanaWorkspaceId),
    orderBy: desc(companies.updatedAt),
  });
}

/**
 * For Restori / Spartan emails, attach to an existing org company instead of creating a solo company.
 * Falls back to the best-known spartanrestoration.com row when Asana is not connected yet.
 */
export async function findSharedCompanyForEmail(email: string) {
  if (!isSharedCompanyEmail(email)) return null;

  const domain = emailDomain(email);
  const byDomain = await db
    .select({
      companyId: users.companyId,
      memberCount: sql<number>`count(*)::int`,
    })
    .from(users)
    .where(sql`lower(split_part(${users.email}, '@', 2)) = ${domain}`)
    .groupBy(users.companyId)
    .orderBy(sql`count(*) desc`)
    .limit(1);

  if (byDomain.length) {
    return db.query.companies.findFirst({ where: eq(companies.id, byDomain[0].companyId) });
  }

  return db.query.companies.findFirst({
    where: and(eq(companies.name, "spartanrestoration.com"), isNotNull(companies.asanaWorkspaceId)),
    orderBy: desc(companies.updatedAt),
  });
}

export async function resolveCompanyIdForUser({
  userId,
  email,
  currentCompanyId,
  asanaWorkspaceId,
}: {
  userId: string;
  email: string;
  currentCompanyId: string;
  asanaWorkspaceId?: string | null;
}) {
  if (asanaWorkspaceId?.trim()) {
    const byWorkspace = await findCompanyByAsanaWorkspaceId(asanaWorkspaceId.trim());
    if (byWorkspace && byWorkspace.id !== currentCompanyId) {
      await db.update(users).set({ companyId: byWorkspace.id }).where(eq(users.id, userId));
      return byWorkspace.id;
    }
    if (byWorkspace) return byWorkspace.id;
  }

  if (isSharedCompanyEmail(email)) {
    const shared = await findSharedCompanyForEmail(email);
    if (shared && shared.id !== currentCompanyId) {
      await db.update(users).set({ companyId: shared.id }).where(eq(users.id, userId));
      return shared.id;
    }
    if (shared) return shared.id;
  }

  return currentCompanyId;
}
