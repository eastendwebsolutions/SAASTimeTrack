import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PokerSessionCreateForm } from "@/components/poker-planning/poker-session-create-form";
import { canManagePokerPlanning } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCompanyPokerAsanaMapping } from "@/lib/services/poker-planning/asana";

export default async function PokerPlanningCreatePage() {
  const user = await getOrCreateCurrentUser();
  if (!user || !canManagePokerPlanning(user.role)) {
    redirect("/poker-planning");
  }

  const companyUsers = await db.query.users.findMany({
    where: eq(users.companyId, user.companyId),
    orderBy: (table) => [asc(table.email)],
  });
  const mapping = await getCompanyPokerAsanaMapping(user.companyId);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Create Poker Session</h1>
      <PokerSessionCreateForm users={companyUsers} mapping={mapping} />
    </div>
  );
}
