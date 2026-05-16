import { and, desc, eq, inArray } from "drizzle-orm";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { requiresPersonalIntegration } from "@/lib/auth/integration-requirements";
import { TimezoneSync } from "@/components/providers/timezone-sync";
import { AppHeader } from "@/components/layout/app-header";
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
  const appHomeHref =
    user?.role === "user" || (user && isSuperAdmin(user.role)) ? "/dashboard" : "/time";
  const integrationOptional = user ? !requiresPersonalIntegration(user.role) : false;

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

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/time", label: "Time" },
    { href: "/billing", label: "Billing" },
    { href: "/reports", label: "Reports" },
    ...(canSeePokerPlanning ? [{ href: "/poker-planning", label: "Poker" }] : []),
    ...(canSeeAdmin ? [{ href: "/admin/review", label: "Admin" }] : []),
  ];

  const timesheetItems = [
    { href: "/timesheet", label: "Current timesheet" },
    { href: "/timesheet/archive", label: "Archive" },
  ];

  return (
    <div className="min-h-screen">
      <TimezoneSync currentTimezone={user?.timezone ?? null} />
      <AppHeader
        appHomeHref={appHomeHref}
        navItems={navItems}
        timesheetItems={timesheetItems}
        canSeeAdmin={canSeeAdmin}
        integration={{
          provider: activeProvider,
          connected:
            activeProvider === "asana"
              ? Boolean(asanaConnection)
              : activeProvider === "jira"
                ? Boolean(jiraConnection)
                : Boolean(mondayConnection),
          integrationOptional,
          lastSyncLabel: latestSyncLabel,
          lastSyncedAtIso: latestSyncedAt ? latestSyncedAt.toISOString() : null,
          timezone: user?.timezone ?? "UTC",
        }}
      />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
