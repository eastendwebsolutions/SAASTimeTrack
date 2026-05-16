import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { InvoicingPageClient } from "@/components/billing/invoicing-page-client";

export default async function InvoicingPage() {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const userDisplayName = user.displayName?.trim() || user.email.split("@")[0];
  return <InvoicingPageClient userDisplayName={userDisplayName} userEmail={user.email} />;
}
