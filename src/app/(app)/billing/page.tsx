import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { BillingPageClient } from "@/components/billing/billing-page-client";

export default async function BillingPage() {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  return <BillingPageClient userRole={user.role} />;
}

