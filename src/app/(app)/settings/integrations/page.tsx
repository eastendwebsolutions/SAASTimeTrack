import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { fetchAsanaMe } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections, jiraConnections, mondayConnections, syncRuns } from "@/lib/db/schema";
import { decrypt } from "@/lib/utils/crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AsanaSyncPanel } from "@/components/integrations/asana-sync-panel";
import { getJiraReadiness } from "@/lib/integrations/jira-readiness";
import { IntegrationLabel } from "@/components/integrations/integration-label";
import { getMondayReadiness } from "@/lib/integrations/monday-readiness";
import { getActiveProviderForUser } from "@/lib/integrations/provider";

const ASANA_ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Asana did not return a complete authorization response. Use Connect Asana again.",
  invalid_state: "The connect link was invalid or expired. Open Settings → Integrations and use Connect Asana again.",
  user_mismatch: "You signed in as a different user than the one who started connect. Try Connect Asana again.",
  exchange_failed:
    "Asana rejected the token (wrong redirect URL/secret, or the code was already used). Check your Asana app redirect URL matches production, then use Connect Asana again.",
  save_failed: "Could not save the connection to the database. Try again or check server logs.",
};

const JIRA_ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Jira did not return a complete authorization response. Use Connect Jira again.",
  invalid_state: "The connect link was invalid or expired. Open Settings -> Integrations and use Connect Jira again.",
  user_mismatch: "You signed in as a different user than the one who started connect. Try Connect Jira again.",
  no_site_access: "Jira token succeeded but no accessible Jira site was returned for this user.",
  exchange_failed: "Jira token exchange failed. Verify Jira OAuth app settings and retry.",
  not_enabled: "Jira is currently gated. Enable schema + feature flag before connecting.",
  schema_not_ready: "Jira DB schema is not ready yet. Apply migration first, then connect.",
  env_invalid: "Jira environment settings are invalid.",
};

const MONDAY_ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Monday did not return a complete authorization response. Use Connect Monday again.",
  invalid_state: "The connect link was invalid or expired. Open Settings -> Integrations and use Connect Monday again.",
  user_mismatch: "You signed in as a different user than the one who started connect. Try Connect Monday again.",
  exchange_failed: "Monday token exchange failed. Verify Monday OAuth app settings and retry.",
  not_enabled: "Monday is currently gated. Enable schema + feature flag before connecting.",
  schema_not_ready: "Monday DB schema is not ready yet. Apply migration first, then connect.",
  env_invalid: "Monday environment settings are invalid.",
};

type SearchParams = Promise<{
  config?: string;
  missing?: string;
  asana_error?: string;
  asana_connected?: string;
  jira_error?: string;
  jira_connected?: string;
  monday_error?: string;
  monday_connected?: string;
  provider_error?: string;
  provider_switched?: string;
}>;

export default async function IntegrationsPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const params = searchParams ? await searchParams : {};
  const showAsanaConfigHelp = params.config === "asana";
  const showJiraConfigHelp = params.config === "jira";
  const showMondayConfigHelp = params.config === "monday";
  const missingKeys = params.missing?.split(",").filter(Boolean) ?? [];
  const asanaErrorCode = params.asana_error?.trim();
  const asanaErrorMessage = asanaErrorCode ? ASANA_ERROR_MESSAGES[asanaErrorCode] ?? `Something went wrong (${asanaErrorCode}).` : null;
  const jiraErrorCode = params.jira_error?.trim();
  const jiraErrorMessage = jiraErrorCode ? JIRA_ERROR_MESSAGES[jiraErrorCode] ?? `Something went wrong (${jiraErrorCode}).` : null;
  const triggerInitialSync = params.asana_connected === "1";
  const jiraConnectedNow = params.jira_connected === "1";
  const triggerJiraInitialSync = jiraConnectedNow;
  const mondayErrorCode = params.monday_error?.trim();
  const mondayErrorMessage = mondayErrorCode ? MONDAY_ERROR_MESSAGES[mondayErrorCode] ?? `Something went wrong (${mondayErrorCode}).` : null;
  const mondayConnectedNow = params.monday_connected === "1";
  const triggerMondayInitialSync = mondayConnectedNow;
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? "https://your-production-domain").replace(/\/$/, "");
  const asanaCallbackExample = `${appBase}/api/asana/callback`;
  const jiraCallbackExample = `${appBase}/api/jira/callback`;
  const jiraReadiness = await getJiraReadiness();
  const mondayReadiness = await getMondayReadiness();
  const activeProvider = await getActiveProviderForUser(user.id);

  const connection = await db.query.asanaConnections.findFirst({
    where: eq(asanaConnections.userId, user.id),
  });
  const jiraConnection = jiraReadiness.schemaReady
    ? await db.query.jiraConnections.findFirst({
        where: eq(jiraConnections.userId, user.id),
      })
    : null;
  const mondayConnection = mondayReadiness.schemaReady
    ? await db.query.mondayConnections.findFirst({
        where: eq(mondayConnections.userId, user.id),
      })
    : null;

  let asanaMe: Awaited<ReturnType<typeof fetchAsanaMe>> | null = null;
  if (connection) {
    try {
      asanaMe = await fetchAsanaMe(decrypt(connection.accessTokenEncrypted));
    } catch {
      asanaMe = null;
    }
  }

  const latestAsanaRun = await db.query.syncRuns.findFirst({
    where: and(
      eq(syncRuns.companyId, user.companyId),
      eq(syncRuns.userId, user.id),
      inArray(syncRuns.type, ["initial", "periodic", "manual"]),
    ),
    orderBy: (table) => [desc(table.startedAt)],
  });
  const latestJiraRun = jiraReadiness.schemaReady
    ? await db.query.syncRuns.findFirst({
        where: and(
          eq(syncRuns.companyId, user.companyId),
          eq(syncRuns.userId, user.id),
          inArray(syncRuns.type, ["jira_initial", "jira_periodic", "jira_manual"]),
        ),
        orderBy: (table) => [desc(table.startedAt)],
      })
    : null;
  const latestMondayRun = mondayReadiness.schemaReady
    ? await db.query.syncRuns.findFirst({
        where: and(
          eq(syncRuns.companyId, user.companyId),
          eq(syncRuns.userId, user.id),
          inArray(syncRuns.type, ["monday_initial", "monday_periodic", "monday_manual"]),
        ),
        orderBy: (table) => [desc(table.startedAt)],
      })
    : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Integrations</h1>
      {asanaErrorMessage ? (
        <Card className="border border-rose-900/80 bg-rose-950/40 p-4 text-sm text-rose-100">
          <p className="font-medium text-rose-50">
            <IntegrationLabel integration="asana" text="Asana connect did not finish" />
          </p>
          <p className="mt-2 text-rose-200/90">{asanaErrorMessage}</p>
        </Card>
      ) : null}
      {showAsanaConfigHelp ? (
        <Card className="border border-amber-800/80 bg-amber-950/40 p-4 text-sm text-amber-100">
          <p className="font-medium text-amber-50">
            <IntegrationLabel integration="asana" text="Asana OAuth is not configured on the server" />
          </p>
          <p className="mt-2 text-amber-200/90">
            In Vercel → your project → <strong>Settings → Environment Variables</strong> (Production), add:
          </p>
          <ul className="mt-2 list-inside list-disc text-amber-200/90">
            <li>
              <code className="text-amber-100">ASANA_CLIENT_ID</code>,{" "}
              <code className="text-amber-100">ASANA_CLIENT_SECRET</code>
            </li>
            <li>
              <code className="text-amber-100">ASANA_REDIRECT_URI</code> — must match{" "}
              <code className="break-all text-amber-100">{asanaCallbackExample}</code> (same value as{" "}
              <code className="text-amber-100">NEXT_PUBLIC_APP_URL</code> + <code className="text-amber-100">/api/asana/callback</code>, and the
              same redirect URL in your Asana app)
            </li>
            <li>
              <code className="text-amber-100">ENCRYPTION_KEY</code> — at least 32 characters (generate with{" "}
              <code className="text-amber-100">openssl rand -base64 48</code>)
            </li>
          </ul>
          {missingKeys.length > 0 ? (
            <p className="mt-2 text-xs text-amber-300/90">Detected missing or invalid: {missingKeys.join(", ")}</p>
          ) : null}
          <p className="mt-3 text-xs text-amber-300/80">Save variables, then redeploy the project. After that, use Connect Asana again.</p>
        </Card>
      ) : null}
      {jiraErrorMessage ? (
        <Card className="border border-rose-900/80 bg-rose-950/40 p-4 text-sm text-rose-100">
          <p className="font-medium text-rose-50">
            <IntegrationLabel integration="jira" text="Jira connect did not finish" />
          </p>
          <p className="mt-2 text-rose-200/90">{jiraErrorMessage}</p>
        </Card>
      ) : null}
      {showJiraConfigHelp ? (
        <Card className="border border-amber-800/80 bg-amber-950/40 p-4 text-sm text-amber-100">
          <p className="font-medium text-amber-50">
            <IntegrationLabel integration="jira" text="Jira rollout prerequisites are not complete" />
          </p>
          {missingKeys.length > 0 ? (
            <p className="mt-2 text-xs text-amber-300/90">Missing or invalid: {missingKeys.join(", ")}</p>
          ) : null}
          <p className="mt-2 text-xs text-amber-300/80">Apply migration, set env vars, and enable feature flag before connecting.</p>
        </Card>
      ) : null}
      {mondayErrorMessage ? (
        <Card className="border border-rose-900/80 bg-rose-950/40 p-4 text-sm text-rose-100">
          <p className="font-medium text-rose-50">
            <IntegrationLabel integration="monday" text="Monday connect did not finish" />
          </p>
          <p className="mt-2 text-rose-200/90">{mondayErrorMessage}</p>
        </Card>
      ) : null}
      {showMondayConfigHelp ? (
        <Card className="border border-amber-800/80 bg-amber-950/40 p-4 text-sm text-amber-100">
          <p className="font-medium text-amber-50">
            <IntegrationLabel integration="monday" text="Monday rollout prerequisites are not complete" />
          </p>
          {missingKeys.length > 0 ? (
            <p className="mt-2 text-xs text-amber-300/90">Missing or invalid: {missingKeys.join(", ")}</p>
          ) : null}
          <p className="mt-2 text-xs text-amber-300/80">Apply migration, set env vars, and enable feature flag before connecting.</p>
        </Card>
      ) : null}
      <Card className="p-5">
        <h2 className="mb-2 font-medium">Active Project Integration</h2>
        <p className="mb-4 text-sm text-zinc-400">Select which connected provider should power project/task data in Time Entry and Timesheet.</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/integrations/active-provider?provider=asana&redirect=/settings/integrations">
            <Button variant={activeProvider === "asana" ? "primary" : "secondary"} disabled={!connection}>
              <IntegrationLabel integration="asana" text={activeProvider === "asana" ? "Asana (Active)" : "Use Asana"} />
            </Button>
          </a>
          <a href="/api/integrations/active-provider?provider=jira&redirect=/settings/integrations">
            <Button variant={activeProvider === "jira" ? "primary" : "secondary"} disabled={!jiraConnection}>
              <IntegrationLabel integration="jira" text={activeProvider === "jira" ? "Jira (Active)" : "Use Jira"} />
            </Button>
          </a>
          <a href="/api/integrations/active-provider?provider=monday&redirect=/settings/integrations">
            <Button variant={activeProvider === "monday" ? "primary" : "secondary"} disabled={!mondayConnection}>
              <IntegrationLabel integration="monday" text={activeProvider === "monday" ? "Monday (Active)" : "Use Monday"} />
            </Button>
          </a>
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 font-medium">
          <IntegrationLabel integration="asana" text="Asana" />
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          {connection ? "Connected" : "Not connected"}. Each user connects their own Asana account—no workspace-wide app install.
          Sync pulls projects you can access and tasks assigned to you, stored for your account only.
        </p>
        <p className="mb-4 text-sm text-zinc-500">
          The Asana account used for sync is whichever account you <strong>approve in the Asana OAuth screen</strong> while signed into
          SAASTimeTrack as this profile. It is tied to your SAASTimeTrack user id—not whichever account happens to be open in another
          browser tab on asana.com.
        </p>
        {connection ? (
          <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-300">
            <p className="font-medium text-zinc-100">Identity check</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-400">
              <li>
                <span className="text-zinc-500">SAASTimeTrack profile (this login):</span>{" "}
                <span className="text-zinc-100">{user.email}</span>
              </li>
              <li>
                <span className="text-zinc-500">Asana account linked to this profile:</span>{" "}
                {asanaMe ? (
                  <span className="text-zinc-100">
                    {asanaMe.name ?? "—"}
                    {asanaMe.email ? ` · ${asanaMe.email}` : null}
                    {asanaMe.email ? null : " (no email returned by Asana)"}
                  </span>
                ) : (
                  <span className="text-amber-200/90">
                    Could not load (token may be expired). Use Reconnect Asana if this persists.
                  </span>
                )}
              </li>
            </ul>
            {asanaMe?.email &&
            user.email.toLowerCase().trim() !== asanaMe.email.toLowerCase().trim() ? (
              <p className="mt-2 text-xs text-amber-200/90">
                These emails differ. Sync still runs only for <strong>this</strong> SAASTimeTrack user; the data is whatever that linked
                Asana user can see. Use Reconnect if you meant to use the same email in both places.
              </p>
            ) : null}
          </div>
        ) : null}
        <a href="/api/asana/connect/url">
          <Button>
            <IntegrationLabel integration="asana" text={connection ? "Reconnect Asana" : "Connect Asana"} />
          </Button>
        </a>
        <AsanaSyncPanel
          connected={Boolean(connection)}
          triggerInitialSync={triggerInitialSync}
          initialRun={
            latestAsanaRun
              ? {
                  status: latestAsanaRun.status,
                  startedAt: latestAsanaRun.startedAt.toISOString(),
                  endedAt: latestAsanaRun.endedAt?.toISOString() ?? null,
                  error: latestAsanaRun.error ?? null,
                  projectsSynced: latestAsanaRun.projectsSynced,
                  tasksSynced: latestAsanaRun.tasksSynced,
                  subtasksSynced: latestAsanaRun.subtasksSynced,
                }
              : null
          }
        />
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 font-medium">
          <IntegrationLabel integration="jira" text="Jira (Safe Rollout)" />
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Jira is being reintroduced with outage-safe gating. It will only activate after database migration and feature flag checks pass.
        </p>
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
          <p>
            Environment configured:{" "}
            <span className={jiraReadiness.envReady ? "text-emerald-400" : "text-amber-300"}>
              {jiraReadiness.envReady ? "Ready" : "Pending"}
            </span>
          </p>
          <p>
            Database migration applied:{" "}
            <span className={jiraReadiness.schemaReady ? "text-emerald-400" : "text-amber-300"}>
              {jiraReadiness.schemaReady ? "Ready" : "Pending"}
            </span>
          </p>
          <p>
            Feature flag enabled:{" "}
            <span className={jiraReadiness.featureEnabled ? "text-emerald-400" : "text-amber-300"}>
              {jiraReadiness.featureEnabled ? "Ready" : "Pending"}
            </span>
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Callback target: <code className="text-zinc-300">{jiraCallbackExample}</code>
          </p>
          {!jiraReadiness.fullyReady ? (
            <p className="mt-2 text-xs text-amber-300">
              Jira connect/sync endpoints remain disabled until all checks are ready.
            </p>
          ) : null}
          {jiraConnectedNow ? <p className="mt-2 text-xs text-emerald-300">Jira connected successfully.</p> : null}
          <div className="mt-3">
            {jiraReadiness.fullyReady ? (
              <a href="/api/jira/connect/url">
                <Button variant="secondary">
                  <IntegrationLabel integration="jira" text={jiraConnection ? "Reconnect Jira" : "Connect Jira"} />
                </Button>
              </a>
            ) : (
              <Button variant="secondary" disabled>
                <IntegrationLabel integration="jira" text="Connect Jira (locked until ready)" />
              </Button>
            )}
          </div>
          <AsanaSyncPanel
            providerLabel="Jira"
            initialSyncPath="/api/jira/sync/initial"
            statusPath="/api/jira/sync/status"
            connected={Boolean(jiraConnection)}
            triggerInitialSync={triggerJiraInitialSync}
            initialRun={
              latestJiraRun
                ? {
                    status: latestJiraRun.status,
                    startedAt: latestJiraRun.startedAt.toISOString(),
                    endedAt: latestJiraRun.endedAt?.toISOString() ?? null,
                    error: latestJiraRun.error ?? null,
                    projectsSynced: latestJiraRun.projectsSynced,
                    tasksSynced: latestJiraRun.tasksSynced,
                    subtasksSynced: latestJiraRun.subtasksSynced,
                  }
                : null
            }
          />
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 font-medium">
          <IntegrationLabel integration="monday" text="Monday (Safe Rollout)" />
        </h2>
        <p className="mb-4 text-sm text-zinc-400">
          Monday is being introduced with outage-safe gating. It will only activate after database migration and feature flag checks pass.
        </p>
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3 text-sm text-zinc-300">
          <p>
            Environment configured:{" "}
            <span className={mondayReadiness.envReady ? "text-emerald-400" : "text-amber-300"}>
              {mondayReadiness.envReady ? "Ready" : "Pending"}
            </span>
          </p>
          <p>
            Database migration applied:{" "}
            <span className={mondayReadiness.schemaReady ? "text-emerald-400" : "text-amber-300"}>
              {mondayReadiness.schemaReady ? "Ready" : "Pending"}
            </span>
          </p>
          <p>
            Feature flag enabled:{" "}
            <span className={mondayReadiness.featureEnabled ? "text-emerald-400" : "text-amber-300"}>
              {mondayReadiness.featureEnabled ? "Ready" : "Pending"}
            </span>
          </p>
          {!mondayReadiness.fullyReady ? (
            <p className="mt-2 text-xs text-amber-300">
              Monday connect/sync endpoints remain disabled until all checks are ready.
            </p>
          ) : null}
          {mondayConnectedNow ? <p className="mt-2 text-xs text-emerald-300">Monday connected successfully.</p> : null}
          <div className="mt-3">
            {mondayReadiness.fullyReady ? (
              <a href="/api/monday/connect/url">
                <Button variant="secondary">
                  <IntegrationLabel integration="monday" text={mondayConnection ? "Reconnect Monday" : "Connect Monday"} />
                </Button>
              </a>
            ) : (
              <Button variant="secondary" disabled>
                <IntegrationLabel integration="monday" text="Connect Monday (locked until ready)" />
              </Button>
            )}
          </div>
          <AsanaSyncPanel
            providerLabel="Monday"
            initialSyncPath="/api/monday/sync/initial"
            statusPath="/api/monday/sync/status"
            connected={Boolean(mondayConnection)}
            triggerInitialSync={triggerMondayInitialSync}
            initialRun={
              latestMondayRun
                ? {
                    status: latestMondayRun.status,
                    startedAt: latestMondayRun.startedAt.toISOString(),
                    endedAt: latestMondayRun.endedAt?.toISOString() ?? null,
                    error: latestMondayRun.error ?? null,
                    projectsSynced: latestMondayRun.projectsSynced,
                    tasksSynced: latestMondayRun.tasksSynced,
                    subtasksSynced: latestMondayRun.subtasksSynced,
                  }
                : null
            }
          />
        </div>
      </Card>
    </div>
  );
}
