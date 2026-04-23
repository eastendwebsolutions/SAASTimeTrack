import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { PokerSessionCreateForm } from "@/components/poker-planning/poker-session-create-form";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getCompanyPokerAsanaMapping } from "@/lib/services/poker-planning/asana";
import { hasAnyPokerWorkspaceAdminAccess } from "@/lib/services/poker-planning/auth";

export default async function PokerPlanningCreatePage() {
  const user = await getOrCreateCurrentUser();
  const hasAccess = user ? await hasAnyPokerWorkspaceAdminAccess(user.id, user.companyId) : false;
  if (!user || (user.role !== "super_admin" && !hasAccess)) {
    redirect("/poker-planning");
  }

  const companyUsers = await db.query.users.findMany({
    where: eq(users.companyId, user.companyId),
    columns: {
      id: true,
      email: true,
      role: true,
    },
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
