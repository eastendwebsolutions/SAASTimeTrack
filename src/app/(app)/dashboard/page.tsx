import Link from "next/link";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { requiresPersonalIntegration } from "@/lib/auth/integration-requirements";
import { IntegrationLabel } from "@/components/integrations/integration-label";
import { userHasAnyIntegrationConnectionByAppUserId } from "@/lib/integrations/connection-gate";
import { Card } from "@/components/ui/card";
import { TeamStatusPanel } from "@/components/dashboard/team-status-panel";
import { getActiveProviderForUser } from "@/lib/integrations/provider";
import {
  getDashboardIntegrationTaskWidget,
  type IntegrationTaskWidget,
} from "@/lib/services/dashboard-integration-tasks";
import { getDashboardPokerOutlook } from "@/lib/services/dashboard-poker-outlook";
import { formatHoursFromMinutes, getDashboardTimeSummary } from "@/lib/services/dashboard-time-summary";

function formatDateTimeSafe(date: Date, timezone: string) {
  try {
    return date.toLocaleString("en-US", { timeZone: timezone });
  } catch {
    return date.toLocaleString("en-US", { timeZone: "UTC" });
  }
}

export default async function DashboardPage() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null;
  }

  const tz = user.timezone ?? "UTC";
  const activeProvider = await getActiveProviderForUser(user.id);
  const integrationOptional = !requiresPersonalIntegration(user.role);
  const hasPersonalIntegration = integrationOptional
    ? await userHasAnyIntegrationConnectionByAppUserId(user.id)
    : true;

  const [timeSummary, pokerOutlook] = await Promise.all([
    getDashboardTimeSummary(user.id),
    getDashboardPokerOutlook({ userId: user.id, companyId: user.companyId }),
  ]);

  const integrationWidget: IntegrationTaskWidget =
    integrationOptional && !hasPersonalIntegration
      ? {
          provider: activeProvider,
          assignedTotal: 0,
          dueToday: null,
          liveDueDates: false,
          optionalNote:
            "Super admins do not need a personal Asana (or other) integration. Use Admin and Reports to manage the workspace. Connect an integration only if you want your own task counts here.",
        }
      : await getDashboardIntegrationTaskWidget({
          userId: user.id,
          companyId: user.companyId,
          provider: activeProvider,
          timeZone: tz,
        });

  const integrationTitle = integrationWidget.optionalNote
    ? "Personal integration (optional)"
    : activeProvider === "asana"
      ? "My Asana status"
      : activeProvider === "jira"
        ? "My Jira status"
        : "My Monday status";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {integrationOptional
            ? "Workspace overview, optional personal integration stats, and planning activity."
            : "Your work, integration tasks, and latest planning session at a glance."}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="p-5 md:col-span-2 xl:col-span-1">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">My work at a glance</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Time logged for calendar day {timeSummary.labels.yesterday} (previous day), this week starting{" "}
            {timeSummary.labels.currentWeekStart}, and last week starting {timeSummary.labels.previousWeekStart}.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3">
              <dt className="text-xs text-zinc-500">Previous day</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-100">{formatHoursFromMinutes(timeSummary.yesterdayMinutes)}</dd>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3">
              <dt className="text-xs text-zinc-500">This week</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-100">{formatHoursFromMinutes(timeSummary.currentWeekMinutes)}</dd>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3">
              <dt className="text-xs text-zinc-500">Previous week</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-100">{formatHoursFromMinutes(timeSummary.previousWeekMinutes)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <Link href="/time" className="text-indigo-400 hover:text-indigo-300">
              Log time
            </Link>
            <span className="text-zinc-600">·</span>
            <Link href="/timesheet" className="text-indigo-400 hover:text-indigo-300">
              Open timesheet
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            <IntegrationLabel integration={integrationWidget.provider} text={integrationTitle} />
          </h2>
          <p className="mt-2 text-xs text-zinc-500">
            {integrationWidget.optionalNote
              ? integrationWidget.optionalNote
              : integrationWidget.liveDueDates
                ? "Open tasks assigned to you (live from Asana), including due today in your profile timezone."
                : integrationWidget.provider === "asana"
                  ? "Assigned counts reflect the last sync to this app. Due today appears when live Asana data can be loaded."
                  : "Assigned counts reflect the last sync. Due today is not computed for this integration yet."}
          </p>
          {integrationWidget.error && !integrationWidget.optionalNote ? (
            <p className="mt-2 text-xs text-amber-400">
              {integrationWidget.error}{" "}
              {integrationWidget.error.includes("Reconnect Asana") ? (
                <Link href="/settings/integrations" className="text-indigo-400 hover:text-indigo-300">
                  Open integration settings
                </Link>
              ) : null}
            </p>
          ) : null}
          {!integrationWidget.optionalNote ? (
            <dl className="mt-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-zinc-400">Assigned to me (open)</dt>
                <dd className="text-2xl font-semibold text-zinc-100">{integrationWidget.assignedTotal}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-sm text-zinc-400">Due today</dt>
                <dd className="text-2xl font-semibold text-zinc-100">
                  {integrationWidget.dueToday === null ? "—" : integrationWidget.dueToday}
                </dd>
              </div>
            </dl>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            {integrationWidget.optionalNote ? (
              <>
                <Link href="/admin/review" className="text-indigo-400 hover:text-indigo-300">
                  Admin
                </Link>
                <span className="text-zinc-600">·</span>
                <Link href="/reports" className="text-indigo-400 hover:text-indigo-300">
                  Reports
                </Link>
                <span className="text-zinc-600">·</span>
              </>
            ) : null}
            <Link href="/settings/integrations" className="text-indigo-400 hover:text-indigo-300">
              {integrationWidget.optionalNote ? "Connect integration (optional)" : "Integration settings"}
            </Link>
          </div>
        </Card>

        <Card className="p-5 md:col-span-2 xl:col-span-1">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">My poker outlook</h2>
          <p className="mt-2 text-xs text-zinc-500">
            Your most recent completed session where you participated, with team totals and your assigned stories.
          </p>
          {pokerOutlook ? (
            <div className="mt-4 space-y-3 text-sm text-zinc-300">
              <p className="font-medium text-zinc-100">{pokerOutlook.sessionTitle}</p>
              {pokerOutlook.completedAt ? (
                <p className="text-xs text-zinc-500">Completed {formatDateTimeSafe(pokerOutlook.completedAt, tz)}</p>
              ) : null}
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3">
                  <dt className="text-xs text-zinc-500">Team story points (finalized)</dt>
                  <dd className="mt-1 text-xl font-semibold text-zinc-100">{pokerOutlook.teamStoryPoints}</dd>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-3">
                  <dt className="text-xs text-zinc-500">Your points / your tasks</dt>
                  <dd className="mt-1 text-xl font-semibold text-zinc-100">
                    {pokerOutlook.myStoryPoints} pts / {pokerOutlook.myTaskCount}{" "}
                    {pokerOutlook.myTaskCount === 1 ? "task" : "tasks"}
                  </dd>
                </div>
              </dl>
              <Link
                href={`/poker-planning/history/${pokerOutlook.sessionId}`}
                className="inline-block text-xs text-indigo-400 hover:text-indigo-300"
              >
                View session history
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">No completed poker sessions yet, or you have not joined one.</p>
          )}
          <Link href="/poker-planning" className="mt-4 inline-block text-xs text-indigo-400 hover:text-indigo-300">
            Poker planning
          </Link>
        </Card>
      </div>

      <TeamStatusPanel isSuperAdmin={user.role === "super_admin"} />
    </div>
  );
}
