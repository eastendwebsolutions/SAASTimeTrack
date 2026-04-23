import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { fetchAsanaMe } from "@/lib/asana/client";
import { db } from "@/lib/db";
import { asanaConnections, jiraConnections, syncRuns } from "@/lib/db/schema";
import { getActiveProviderForUser, type IntegrationProvider } from "@/lib/integrations/provider";
import { fetchJiraMe } from "@/lib/jira/client";
import { decrypt } from "@/lib/utils/crypto";
import { and, desc, eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AsanaSyncPanel } from "@/components/integrations/asana-sync-panel";

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
  exchange_failed:
    "Jira rejected the token or site fetch failed (redirect/client settings may be wrong). Check OAuth app settings and retry.",
};

type SearchParams = Promise<{
  config?: string;
  missing?: string;
  asana_error?: string;
  asana_connected?: string;
  jira_error?: string;
  jira_connected?: string;
}>;

export default async function IntegrationsPage({ searchParams }: { searchParams?: SearchParams }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;
  const currentUser = user;

  const params = searchParams ? await searchParams : {};
  const showAsanaConfigHelp = params.config === "asana";
  const showJiraConfigHelp = params.config === "jira";
  const missingKeys = params.missing?.split(",").filter(Boolean) ?? [];
  const asanaErrorCode = params.asana_error?.trim();
  const asanaErrorMessage = asanaErrorCode ? ASANA_ERROR_MESSAGES[asanaErrorCode] ?? `Something went wrong (${asanaErrorCode}).` : null;
  const jiraErrorCode = params.jira_error?.trim();
  const jiraErrorMessage = jiraErrorCode ? JIRA_ERROR_MESSAGES[jiraErrorCode] ?? `Something went wrong (${jiraErrorCode}).` : null;
  const triggerInitialSync = params.asana_connected === "1";
  const triggerJiraInitialSync = params.jira_connected === "1";
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? "https://your-production-domain").replace(/\/$/, "");
  const asanaCallbackExample = `${appBase}/api/asana/callback`;
  const jiraCallbackExample = `${appBase}/api/jira/callback`;
  const activeProvider = getActiveProviderForUser(currentUser);

  const connection = await db.query.asanaConnections.findFirst({
    where: eq(asanaConnections.userId, user.id),
  });
  const jiraConnection = await db.query.jiraConnections.findFirst({
    where: eq(jiraConnections.userId, user.id),
  });

  let asanaMe: Awaited<ReturnType<typeof fetchAsanaMe>> | null = null;
  if (connection) {
    try {
      asanaMe = await fetchAsanaMe(decrypt(connection.accessTokenEncrypted));
    } catch {
      asanaMe = null;
    }
  }
  let jiraMe: Awaited<ReturnType<typeof fetchJiraMe>> | null = null;
  if (jiraConnection) {
    try {
      jiraMe = await fetchJiraMe(jiraConnection.jiraCloudId, decrypt(jiraConnection.accessTokenEncrypted));
    } catch {
      jiraMe = null;
    }
  }

  async function latestRunForProvider(provider: IntegrationProvider) {
    return db.query.syncRuns.findFirst({
      where: and(
        eq(syncRuns.companyId, currentUser.companyId),
        eq(syncRuns.userId, currentUser.id),
        eq(syncRuns.provider, provider),
      ),
      orderBy: (table) => [desc(table.startedAt)],
    });
  }
  const [asanaLatestRun, jiraLatestRun] = await Promise.all([latestRunForProvider("asana"), latestRunForProvider("jira")]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Integrations</h1>
      {asanaErrorMessage ? (
        <Card className="border border-rose-900/80 bg-rose-950/40 p-4 text-sm text-rose-100">
          <p className="font-medium text-rose-50">Asana connect did not finish</p>
          <p className="mt-2 text-rose-200/90">{asanaErrorMessage}</p>
        </Card>
      ) : null}
      {showAsanaConfigHelp ? (
        <Card className="border border-amber-800/80 bg-amber-950/40 p-4 text-sm text-amber-100">
          <p className="font-medium text-amber-50">Asana OAuth is not configured on the server</p>
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
          <p className="font-medium text-rose-50">Jira connect did not finish</p>
          <p className="mt-2 text-rose-200/90">{jiraErrorMessage}</p>
        </Card>
      ) : null}
      {showJiraConfigHelp ? (
        <Card className="border border-amber-800/80 bg-amber-950/40 p-4 text-sm text-amber-100">
          <p className="font-medium text-amber-50">Jira OAuth is not configured on the server</p>
          <ul className="mt-2 list-inside list-disc text-amber-200/90">
            <li>
              <code className="text-amber-100">JIRA_CLIENT_ID</code>, <code className="text-amber-100">JIRA_CLIENT_SECRET</code>
            </li>
            <li>
              <code className="text-amber-100">JIRA_REDIRECT_URI</code> should match{" "}
              <code className="break-all text-amber-100">{jiraCallbackExample}</code>
            </li>
            <li>
              <code className="text-amber-100">ENCRYPTION_KEY</code> should be at least 32 characters
            </li>
          </ul>
          {missingKeys.length > 0 ? (
            <p className="mt-2 text-xs text-amber-300/90">Detected missing or invalid: {missingKeys.join(", ")}</p>
          ) : null}
        </Card>
      ) : null}
      <Card className="p-5">
        <h2 className="mb-2 font-medium">Active Project Integration</h2>
        <p className="mb-3 text-sm text-zinc-400">
          Only one provider is active at a time for sync + time entry. Switch after both providers are connected.
        </p>
        <div className="flex items-center gap-2">
          <form action="/api/integrations/active-provider" method="post">
            <input type="hidden" name="provider" value="asana" />
            <Button type="submit" variant={activeProvider === "asana" ? "primary" : "secondary"} disabled={!connection}>
              Use Asana
            </Button>
          </form>
          <form action="/api/integrations/active-provider" method="post">
            <input type="hidden" name="provider" value="jira" />
            <Button type="submit" variant={activeProvider === "jira" ? "primary" : "secondary"} disabled={!jiraConnection}>
              Use Jira
            </Button>
          </form>
          <span className="text-xs text-zinc-500">Current: {activeProvider === "asana" ? "Asana" : "Jira"}</span>
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 font-medium">Asana</h2>
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
          <Button>{connection ? "Reconnect Asana" : "Connect Asana"}</Button>
        </a>
        <AsanaSyncPanel
          connected={Boolean(connection)}
          providerLabel="Asana"
          syncInitialPath="/api/asana/sync/initial"
          syncStatusPath="/api/asana/sync/status"
          triggerInitialSync={triggerInitialSync}
          initialRun={
            asanaLatestRun
              ? {
                  status: asanaLatestRun.status,
                  startedAt: asanaLatestRun.startedAt.toISOString(),
                  endedAt: asanaLatestRun.endedAt?.toISOString() ?? null,
                  error: asanaLatestRun.error ?? null,
                  projectsSynced: asanaLatestRun.projectsSynced,
                  tasksSynced: asanaLatestRun.tasksSynced,
                  subtasksSynced: asanaLatestRun.subtasksSynced,
                }
              : null
          }
        />
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 font-medium">Jira</h2>
        <p className="mb-4 text-sm text-zinc-400">
          {jiraConnection ? "Connected" : "Not connected"}. Jira follows the same OAuth pattern as Asana and can be the active provider.
        </p>
        {jiraConnection ? (
          <div className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-300">
            <p className="font-medium text-zinc-100">Identity check</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-400">
              <li>
                <span className="text-zinc-500">SAASTimeTrack profile:</span>{" "}
                <span className="text-zinc-100">{user.email}</span>
              </li>
              <li>
                <span className="text-zinc-500">Jira account linked:</span>{" "}
                {jiraMe ? (
                  <span className="text-zinc-100">
                    {jiraMe.displayName}
                    {jiraMe.emailAddress ? ` · ${jiraMe.emailAddress}` : ""}
                  </span>
                ) : (
                  <span className="text-amber-200/90">Could not load (token may be expired). Use Reconnect Jira.</span>
                )}
              </li>
              <li>
                <span className="text-zinc-500">Jira site:</span>{" "}
                <span className="text-zinc-100">{jiraConnection.jiraSiteName ?? jiraConnection.jiraCloudId}</span>
              </li>
            </ul>
          </div>
        ) : null}
        <a href="/api/jira/connect/url">
          <Button>{jiraConnection ? "Reconnect Jira" : "Connect Jira"}</Button>
        </a>
        <AsanaSyncPanel
          connected={Boolean(jiraConnection)}
          providerLabel="Jira"
          syncInitialPath="/api/jira/sync/initial"
          syncStatusPath="/api/jira/sync/status"
          triggerInitialSync={triggerJiraInitialSync}
          initialRun={
            jiraLatestRun
              ? {
                  status: jiraLatestRun.status,
                  startedAt: jiraLatestRun.startedAt.toISOString(),
                  endedAt: jiraLatestRun.endedAt?.toISOString() ?? null,
                  error: jiraLatestRun.error ?? null,
                  projectsSynced: jiraLatestRun.projectsSynced,
                  tasksSynced: jiraLatestRun.tasksSynced,
                  subtasksSynced: jiraLatestRun.subtasksSynced,
                }
              : null
          }
        />
      </Card>
    </div>
  );
}
