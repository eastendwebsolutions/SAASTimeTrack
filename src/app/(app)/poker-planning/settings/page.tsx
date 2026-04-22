import { redirect } from "next/navigation";
import { PokerAsanaMappingForm } from "@/components/poker-planning/poker-asana-mapping-form";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { getCompanyPokerAsanaMapping } from "@/lib/services/poker-planning/asana";
import { hasAnyPokerWorkspaceAdminAccess } from "@/lib/services/poker-planning/auth";

export default async function PokerPlanningSettingsPage() {
  const user = await getOrCreateCurrentUser();
  const hasAccess = user ? await hasAnyPokerWorkspaceAdminAccess(user.id, user.companyId) : false;
  if (!user || (user.role !== "super_admin" && !hasAccess)) {
    redirect("/poker-planning");
  }
  const mapping = await getCompanyPokerAsanaMapping(user.companyId);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Poker Planning Asana Mapping</h1>
      <PokerAsanaMappingForm mapping={mapping} />
    </div>
  );
}
