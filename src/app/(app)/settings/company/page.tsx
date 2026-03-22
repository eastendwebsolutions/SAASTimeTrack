import { eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { canManageCompanySettings } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { companySettings } from "@/lib/db/schema";

export default async function CompanySettingsPage() {
  const user = await getOrCreateCurrentUser();
  if (!user || !canManageCompanySettings(user.role)) {
    return <p className="text-zinc-400">Company admin access required.</p>;
  }

  const settings = await db.query.companySettings.findFirst({
    where: eq(companySettings.companyId, user.companyId),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Company Settings</h1>
      <Card className="p-5">
        <p className="text-sm text-zinc-400">
          Admin override for locked entries: {settings?.allowAdminOverrideLockedEntries ? "Enabled" : "Disabled"}
        </p>
      </Card>
    </div>
  );
}
