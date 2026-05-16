import { redirect } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canReviewEntries } from "@/lib/auth/rbac";
import { DeveloperEffectivenessClient } from "@/components/reports/developer-effectiveness-client";

export default async function DeveloperEffectivenessPage() {
  const user = await getOrCreateCurrentUser();
  if (!user) redirect("/sign-in");
  if (!canReviewEntries(user.role)) {
    redirect("/reports");
  }

  return <DeveloperEffectivenessClient />;
}
