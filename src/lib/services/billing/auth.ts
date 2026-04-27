import { canManageCompanySettings, canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";

export async function requireBillingUser() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function requireBillingSettingsAdmin() {
  const user = await requireBillingUser();
  if (!canManageCompanySettings(user.role)) {
    throw new Error("Forbidden");
  }
  return user;
}

export async function requireBillingSubmissionAdmin() {
  const user = await requireBillingUser();
  if (!canReviewEntries(user.role)) {
    throw new Error("Forbidden");
  }
  return user;
}

export function assertCompanyScopeOrSuperAdmin(actor: { role: "user" | "company_admin" | "super_admin"; companyId: string }, companyId: string) {
  if (!isSuperAdmin(actor.role) && actor.companyId !== companyId) {
    throw new Error("Forbidden");
  }
}

