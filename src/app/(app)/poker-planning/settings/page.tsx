import { redirect } from "next/navigation";
import { AuditTrailTable } from "@/components/audit/audit-trail-table";
import { PokerAsanaMappingForm } from "@/components/poker-planning/poker-asana-mapping-form";
import { IntegrationLabel } from "@/components/integrations/integration-label";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { listAuditChanges } from "@/lib/services/audit-log";
import { getCompanyPokerAsanaMapping } from "@/lib/services/poker-planning/asana";
import { hasAnyPokerWorkspaceAdminAccess } from "@/lib/services/poker-planning/auth";

type SearchParams = Promise<{ auditPage?: string }>;

export default async function PokerPlanningSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getOrCreateCurrentUser();
  const hasAccess = user ? await hasAnyPokerWorkspaceAdminAccess(user.id, user.companyId) : false;
  if (!user || (user.role !== "super_admin" && !hasAccess)) {
    redirect("/poker-planning");
  }
  const params = await searchParams;
  const auditPage = Math.max(1, Number(params.auditPage ?? "1") || 1);
  const mapping = await getCompanyPokerAsanaMapping(user.companyId);
  const audit = await listAuditChanges({
    companyId: user.companyId,
    pageKey: "poker_planning_settings",
    page: auditPage,
    pageSize: 10,
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        Poker Planning <IntegrationLabel integration="asana" text="Asana Mapping" />
      </h1>
      <PokerAsanaMappingForm mapping={mapping} />
      <AuditTrailTable
        rows={audit.rows}
        page={audit.page}
        totalPages={audit.totalPages}
        pageParam="auditPage"
        basePath="/poker-planning/settings"
      />
    </div>
  );
}
