import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { and, desc, eq } from "drizzle-orm";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { TimezoneSync } from "@/components/providers/timezone-sync";
import { AsanaHeaderStatus } from "@/components/integrations/asana-header-status";
import { db } from "@/lib/db";
import { asanaConnections, syncRuns } from "@/lib/db/schema";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getOrCreateCurrentUser();
  const connection = user
    ? await db.query.asanaConnections.findFirst({
        where: eq(asanaConnections.userId, user.id),
      })
    : null;
  const latestRun = user
    ? await db.query.syncRuns.findFirst({
        where: and(eq(syncRuns.companyId, user.companyId), eq(syncRuns.userId, user.id)),
        orderBy: (table) => [desc(table.startedAt)],
      })
    : null;

  const latestSyncedAt = latestRun?.endedAt;
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
            <Link href="/time" className="font-semibold text-indigo-300">
              SaaSTimeTrack
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-300">
              <Link href="/time">Time</Link>
              <Link href="/timesheet">Timesheet</Link>
              <Link href="/timesheet/archive">Archive</Link>
              <Link href="/admin/review">Admin</Link>
              <Link href="/settings/integrations">Integrations</Link>
              <Link href="/settings/profile">Profile</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <AsanaHeaderStatus
              asanaConnected={Boolean(connection)}
              lastSyncLabel={latestSyncLabel}
              timezone={user?.timezone ?? "UTC"}
            />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
