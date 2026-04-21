"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  asanaConnected: boolean;
  lastSyncLabel: string;
  timezone: string;
};

export function AsanaHeaderStatus({ asanaConnected, lastSyncLabel, timezone }: Props) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncNow() {
    setMessage(null);
    setIsSyncing(true);
    try {
      const response = await fetch("/api/asana/sync/initial", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        debugBuild?: string;
        summary?: {
          projectsSynced: number;
          tasksSynced: number;
          subtasksSynced: number;
          diagnostics?: {
            workspaceAssignedFetched: number;
            globalAssignedFetched: number;
            assignedSubtasksCandidate: number;
            assignedSubtasksResolvedToProject: number;
          };
        };
        error?: string;
        details?: string;
      };
      if (!response.ok || !data.ok) {
        setMessage(data.details || data.error || "Sync failed.");
        return;
      }
      if (data.summary?.diagnostics || data.debugBuild) {
        setMessage(
          `${data.debugBuild ? `Build: ${data.debugBuild}` : ""}${data.debugBuild && data.summary?.diagnostics ? " | " : ""}${data.summary?.diagnostics ? `Debug: assigned(workspace/global) ${data.summary.diagnostics.workspaceAssignedFetched}/${data.summary.diagnostics.globalAssignedFetched}, candidates ${data.summary.diagnostics.assignedSubtasksCandidate}, resolved ${data.summary.diagnostics.assignedSubtasksResolvedToProject}` : ""}`,
        );
      }
      router.refresh();
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300">
      <p className="font-medium text-zinc-100">Asana: {asanaConnected ? "Connected" : "Not Connected"}</p>
      <p>Last sync: {lastSyncLabel}</p>
      <p>Timezone: {timezone}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {asanaConnected ? (
          <Button
            type="button"
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={isSyncing}
            onClick={() => void syncNow()}
          >
            {isSyncing ? "Syncing…" : "Sync Asana"}
          </Button>
        ) : (
          <Link
            href="/settings/integrations"
            className="inline-flex rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-100 transition hover:bg-zinc-700"
          >
            Connect Asana
          </Link>
        )}
      </div>
      {message ? <p className="mt-1 text-[11px] text-rose-400">{message}</p> : null}
    </div>
  );
}
