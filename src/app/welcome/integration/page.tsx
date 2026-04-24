import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IntegrationLabel } from "@/components/integrations/integration-label";
import { getJiraReadiness } from "@/lib/integrations/jira-readiness";
import { getMondayReadiness } from "@/lib/integrations/monday-readiness";
import { userHasAnyIntegrationConnectionByClerkUserId } from "@/lib/integrations/connection-gate";
import { auth } from "@clerk/nextjs/server";

export default async function WelcomeIntegrationPage() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null;
  }

  const hasAny = await userHasAnyIntegrationConnectionByClerkUserId(userId);
  if (hasAny) {
    redirect("/time");
  }

  const jiraReadiness = await getJiraReadiness();
  const mondayReadiness = await getMondayReadiness();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="font-semibold text-indigo-300">SaaSTimeTrack</span>
          <UserButton />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Connect a work integration</h1>
        <p className="mt-3 text-sm text-zinc-400">
          Choose <strong>one</strong> tool to link first: Asana, Jira, or Monday.com (when enabled on this deployment). After OAuth completes,
          you can use Time Entry and Timesheets. You can switch or add providers later under Settings → Integrations.
        </p>
        <p className="mt-2 text-xs text-zinc-500">Signed in as {user.email}</p>

        <div className="mt-8 space-y-4">
          <Card className="p-5">
            <h2 className="mb-2 text-lg font-medium">
              <IntegrationLabel integration="asana" text="Asana" />
            </h2>
            <p className="mb-4 text-sm text-zinc-400">
              Connect your Asana account to sync projects and tasks you can access. This is the default integration for new workspaces.
            </p>
            <a href="/api/asana/connect/url">
              <Button>
                <IntegrationLabel integration="asana" text="Connect Asana" />
              </Button>
            </a>
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-lg font-medium">
              <IntegrationLabel integration="jira" text="Jira" />
            </h2>
            <p className="mb-4 text-sm text-zinc-400">
              Jira is available only when this deployment has completed rollout checks (database, env, feature flag).
            </p>
            <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
              <p>
                Rollout:{" "}
                <span className={jiraReadiness.fullyReady ? "text-emerald-400" : "text-amber-300"}>
                  {jiraReadiness.fullyReady ? "Ready to connect" : "Not ready (env / migration / flag)"}
                </span>
              </p>
            </div>
            {jiraReadiness.fullyReady ? (
              <a href="/api/jira/connect/url">
                <Button variant="secondary">
                  <IntegrationLabel integration="jira" text="Connect Jira" />
                </Button>
              </a>
            ) : (
              <Button variant="secondary" disabled>
                <IntegrationLabel integration="jira" text="Connect Jira (unavailable)" />
              </Button>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 text-lg font-medium">
              <IntegrationLabel integration="monday" text="Monday.com" />
            </h2>
            <p className="mb-4 text-sm text-zinc-400">
              Monday.com is available only when this deployment has completed rollout checks (database, env, feature flag).
            </p>
            <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
              <p>
                Rollout:{" "}
                <span className={mondayReadiness.fullyReady ? "text-emerald-400" : "text-amber-300"}>
                  {mondayReadiness.fullyReady ? "Ready to connect" : "Not ready (env / migration / flag)"}
                </span>
              </p>
            </div>
            {mondayReadiness.fullyReady ? (
              <a href="/api/monday/connect/url">
                <Button variant="secondary">
                  <IntegrationLabel integration="monday" text="Connect Monday" />
                </Button>
              </a>
            ) : (
              <Button variant="secondary" disabled>
                <IntegrationLabel integration="monday" text="Connect Monday (unavailable)" />
              </Button>
            )}
          </Card>
        </div>

        <p className="mt-8 text-center text-xs text-zinc-500">
          After you finish OAuth, you will be redirected to Integrations to run your first sync when prompted.
        </p>
      </main>
    </div>
  );
}
