import { canReviewEntries } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { BillingAdminSubmissionsClient } from "@/components/billing/billing-admin-submissions-client";

export default async function BillingAdminSubmissionsPage() {
  const user = await getOrCreateCurrentUser();
  if (!user || !canReviewEntries(user.role)) {
    return <p className="text-zinc-400">Billing submissions admin access required.</p>;
  }

  return <BillingAdminSubmissionsClient isSuperAdmin={user.role === "super_admin"} companyId={user.companyId} />;
}

