import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { asanaConnections, syncRuns } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AsanaSyncPanel } from "@/components/integrations/asana-sync-panel";

export default async function IntegrationsPage() {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const connection = await db.query.asanaConnections.findFirst({
    where: eq(asanaConnections.userId, user.id),
  });
  const latestRun = await db.query.syncRuns.findFirst({
    where: and(eq(syncRuns.companyId, user.companyId), eq(syncRuns.userId, user.id)),
    orderBy: (table) => [desc(table.startedAt)],
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Integrations</h1>
      <Card className="p-5">
        <h2 className="mb-2 font-medium">Asana</h2>
        <p className="mb-4 text-sm text-zinc-400">
          {connection ? "Connected" : "Not connected"}. Sync refreshes shared projects/tasks for your whole company workspace.
        </p>
        <a href="/api/asana/connect/url">
          <Button>{connection ? "Reconnect Asana" : "Connect Asana"}</Button>
        </a>
        <AsanaSyncPanel
          connected={Boolean(connection)}
          initialRun={
            latestRun
              ? {
                  status: latestRun.status,
                  startedAt: latestRun.startedAt.toISOString(),
                  endedAt: latestRun.endedAt?.toISOString() ?? null,
                  error: latestRun.error ?? null,
                  projectsSynced: latestRun.projectsSynced,
                  tasksSynced: latestRun.tasksSynced,
                  subtasksSynced: latestRun.subtasksSynced,
                }
              : null
          }
        />
      </Card>
    </div>
  );
}
