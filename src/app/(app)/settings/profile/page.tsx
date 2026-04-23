import { Card } from "@/components/ui/card";
import { AuditTrailTable } from "@/components/audit/audit-trail-table";
import { TimezonePreferenceForm } from "@/components/settings/timezone-preference-form";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { listAuditChanges } from "@/lib/services/audit-log";

type SearchParams = Promise<{ auditPage?: string }>;

export default async function ProfileSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;
  const params = await searchParams;
  const auditPage = Math.max(1, Number(params.auditPage ?? "1") || 1);
  const audit = await listAuditChanges({
    companyId: user.companyId,
    pageKey: "profile_settings",
    page: auditPage,
    pageSize: 10,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile Settings</h1>
      <Card className="space-y-2 p-5">
        <p className="text-sm text-zinc-400">Update how dates and times are shown across time entry and review screens.</p>
        <TimezonePreferenceForm initialTimezone={user.timezone ?? "UTC"} />
      </Card>
      <AuditTrailTable
        rows={audit.rows}
        page={audit.page}
        totalPages={audit.totalPages}
        pageParam="auditPage"
        basePath="/settings/profile"
      />
    </div>
  );
}
