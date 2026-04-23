import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PokerSessionsList } from "@/components/poker-planning/poker-sessions-list";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { hasAnyPokerWorkspaceAdminAccess } from "@/lib/services/poker-planning/auth";

export default async function PokerPlanningPage() {
  const user = await getOrCreateCurrentUser();
  const canCreateSession = user
    ? user.role === "super_admin" || (await hasAnyPokerWorkspaceAdminAccess(user.id, user.companyId))
    : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Poker Planning</h1>
        <div className="flex items-center gap-3">
          <Link className="rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700" href="/poker-planning/history">
            Session History
          </Link>
          {canCreateSession ? (
            <Link className="rounded-md bg-indigo-500 px-3 py-2 text-sm text-white hover:bg-indigo-400" href="/poker-planning/create">
              Create Session
            </Link>
          ) : null}
        </div>
      </div>
      <Card className="p-5">
        <PokerSessionsList />
      </Card>
    </div>
  );
}
