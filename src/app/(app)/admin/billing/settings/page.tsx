import { canManageCompanySettings } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { BillingSettingsClient } from "@/components/billing/billing-settings-client";

export default async function BillingSettingsPage() {
  const user = await getOrCreateCurrentUser();
  if (!user || !canManageCompanySettings(user.role)) {
    return <p className="text-zinc-400">Billing settings admin access required.</p>;
  }

  return <BillingSettingsClient isSuperAdmin={user.role === "super_admin"} />;
}

