import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canReviewEntries } from "@/lib/auth/rbac";
import { TimezoneSync } from "@/components/providers/timezone-sync";
import { AsanaHeaderStatus } from "@/components/integrations/asana-header-status";
import { TeamStatusHeaderIndicator } from "@/components/team-status/header-indicator";
import { db } from "@/lib/db";
import { asanaConnections, jiraConnections, mondayConnections, syncRuns } from "@/lib/db/schema";
import { getActiveProviderForUser } from "@/lib/integrations/provider";
import { isMissingIntegrationSchemaError } from "@/lib/integrations/schema-compat";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getOrCreateCurrentUser();
  const asanaConnection = user
    ? await db.query.asanaConnections.findFirst({
        where: eq(asanaConnections.userId, user.id),
      })
    : null;
  const jiraConnection = user
    ? await db.query.jiraConnections
        .findFirst({
          where: eq(jiraConnections.userId, user.id),
        })
        .catch((error) => {
          if (!isMissingIntegrationSchemaError(error)) throw error;
          return null;
        })
    : null;
  const mondayConnection = user
    ? await db.query.mondayConnections
        .findFirst({
          where: eq(mondayConnections.userId, user.id),
        })
        .catch((error) => {
          if (!isMissingIntegrationSchemaError(error)) throw error;
          return null;
        })
    : null;
  const activeProvider = user ? await getActiveProviderForUser(user.id) : "asana";
  const latestSuccessfulRun = user
    ? await db.query.syncRuns.findFirst({
        where: and(
          eq(syncRuns.companyId, user.companyId),
          eq(syncRuns.userId, user.id),
          eq(syncRuns.status, "success"),
          activeProvider === "asana"
            ? inArray(syncRuns.type, ["initial", "periodic", "manual"])
            : activeProvider === "jira"
              ? inArray(syncRuns.type, ["jira_initial", "jira_periodic", "jira_manual"])
              : inArray(syncRuns.type, ["monday_initial", "monday_periodic", "monday_manual"]),
        ),
        orderBy: (table) => [desc(table.startedAt)],
      })
    : null;
  const canSeeAdmin = Boolean(user && canReviewEntries(user.role));
  const canSeePokerPlanning = Boolean(user);
  const appHomeHref = user?.role === "user" ? "/dashboard" : "/time";

  const latestSyncedAt = latestSuccessfulRun?.endedAt;
  const latestSyncLabel = latestSyncedAt
    ? latestSyncedAt.toLocaleString("en-US", {
        weekday: "short",
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not synced yet";

  return (
    <div className="min-h-screen">
      <TimezoneSync currentTimezone={user?.timezone ?? null} />
      <header className="border-b border-zinc-800 bg-zinc-950/90 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href={appHomeHref} className="font-semibold text-indigo-300">
              SaaSTimeTrack
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-300">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/time">Time Entry</Link>
              <Link href="/reports">Reports</Link>
              <div className="group relative">
                <Link href="/timesheet" className="inline-flex items-center gap-1">
                  Timesheet
                  <span className="text-xs text-zinc-500">▾</span>
                </Link>
                <div className="invisible absolute left-0 top-full z-20 min-w-40 rounded-md border border-zinc-800 bg-zinc-950/95 p-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <Link href="/timesheet/archive" className="block rounded px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
                    Archive
                  </Link>
                </div>
              </div>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {canSeePokerPlanning ? (
              <Link
                href="/poker-planning"
                className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
              >
                Poker Planning
              </Link>
            ) : null}
            {canSeeAdmin ? (
              <Link
                href="/admin/review"
                className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
              >
                Admin
              </Link>
            ) : null}
            <AsanaHeaderStatus
              provider={activeProvider}
              connected={
                activeProvider === "asana"
                  ? Boolean(asanaConnection)
                  : activeProvider === "jira"
                    ? Boolean(jiraConnection)
                    : Boolean(mondayConnection)
              }
              lastSyncLabel={latestSyncLabel}
              lastSyncedAtIso={latestSyncedAt ? latestSyncedAt.toISOString() : null}
              timezone={user?.timezone ?? "UTC"}
            />
            <TeamStatusHeaderIndicator />
            <div className="group relative">
              <UserButton />
              <div className="invisible absolute right-0 top-full z-20 min-w-44 rounded-md border border-zinc-800 bg-zinc-950/95 p-1 opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <Link href="/settings/profile" className="block rounded px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
                  Profile
                </Link>
                <Link href="/settings/integrations" className="block rounded px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
                  Integrations
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
