"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type SyncRun = {
  status: string;
  startedAt: string;
  endedAt: string | null;
  error: string | null;
  projectsSynced: number;
  tasksSynced: number;
  subtasksSynced: number;
};

type Props = {
  connected: boolean;
  initialRun: SyncRun | null;
  /** After OAuth callback; runs first sync in a separate request (avoids callback timeouts). */
  triggerInitialSync?: boolean;
};

export function AsanaSyncPanel({ connected, initialRun, triggerInitialSync = false }: Props) {
  const router = useRouter();
  const postConnectStarted = useRef(false);
  const [run, setRun] = useState<SyncRun | null>(initialRun);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshStatus() {
    const response = await fetch("/api/asana/sync/status", { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { latestRun: SyncRun | null };
    setRun(data.latestRun);
  }

  async function syncNow() {
    setIsSyncing(true);
    setMessage("Sync in progress...");
    try {
      const response = await fetch("/api/asana/sync/initial", { method: "POST" });
      const data = (await response.json()) as {
        ok?: boolean;
        debugBuild?: string;
        summary?: {
          projectsSynced: number;
          tasksSynced: number;
          subtasksSynced: number;
          diagnostics?: {
            workspaceAssignedFetched: number;
            assignedSubtasksCandidate: number;
            assignedSubtasksResolvedToProject: number;
          };
        };
        error?: string;
        details?: string;
      };
      if (!response.ok || !data.ok) {
        setMessage(data.details || data.error || "Sync failed.");
      } else {
        setMessage(
          `Sync complete. Projects: ${data.summary?.projectsSynced ?? 0}, Tasks: ${data.summary?.tasksSynced ?? 0}, Subtasks: ${data.summary?.subtasksSynced ?? 0}` +
            (data.debugBuild ? ` | Build: ${data.debugBuild}` : "") +
            (data.summary?.diagnostics
              ? ` | Debug: assigned(workspace) ${data.summary.diagnostics.workspaceAssignedFetched}, candidates ${data.summary.diagnostics.assignedSubtasksCandidate}, resolved ${data.summary.diagnostics.assignedSubtasksResolvedToProject}`
              : ""),
        );
      }
      await refreshStatus();
    } finally {
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    if (!triggerInitialSync || !connected || postConnectStarted.current) return;
    postConnectStarted.current = true;
    void (async () => {
      setIsSyncing(true);
      setMessage("Finishing Asana setup (first sync)…");
      try {
        const response = await fetch("/api/asana/sync/initial", { method: "POST" });
        const data = (await response.json()) as {
          ok?: boolean;
          debugBuild?: string;
          summary?: {
            projectsSynced: number;
            tasksSynced: number;
            subtasksSynced: number;
            diagnostics?: {
              workspaceAssignedFetched: number;
              assignedSubtasksCandidate: number;
              assignedSubtasksResolvedToProject: number;
            };
          };
          error?: string;
          details?: string;
        };
        if (!response.ok || !data.ok) {
          setMessage(data.details || data.error || "First sync failed. Use “Sync Asana Now” to retry.");
        } else {
          setMessage(
            `Sync complete. Projects: ${data.summary?.projectsSynced ?? 0}, Tasks: ${data.summary?.tasksSynced ?? 0}, Subtasks: ${data.summary?.subtasksSynced ?? 0}` +
              (data.debugBuild ? ` | Build: ${data.debugBuild}` : "") +
              (data.summary?.diagnostics
                ? ` | Debug: assigned(workspace) ${data.summary.diagnostics.workspaceAssignedFetched}, candidates ${data.summary.diagnostics.assignedSubtasksCandidate}, resolved ${data.summary.diagnostics.assignedSubtasksResolvedToProject}`
                : ""),
          );
        }
        await refreshStatus();
      } finally {
        setIsSyncing(false);
        router.replace("/settings/integrations");
        router.refresh();
      }
    })();
  }, [triggerInitialSync, connected, router]);

  return (
    <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
      <div className="grid gap-2 text-sm text-zinc-300">
        <p>
          Last refresh:{" "}
          <span className="text-zinc-100">
            {run?.endedAt ? new Date(run.endedAt).toLocaleString() : "No successful sync yet"}
          </span>
        </p>
        <p>
          Last synced counts:{" "}
          <span className="text-zinc-100">
            Projects {run?.projectsSynced ?? 0} | Tasks {run?.tasksSynced ?? 0} | Subtasks {run?.subtasksSynced ?? 0}
          </span>
        </p>
        <p>
          Status: <span className="capitalize text-zinc-100">{isSyncing ? "running" : run?.status ?? "idle"}</span>
        </p>
        {run?.error ? <p className="text-rose-400">Last error: {run.error}</p> : null}
      </div>

      {connected ? (
        <Button type="button" variant="secondary" onClick={syncNow} disabled={isSyncing}>
          {isSyncing ? "Syncing..." : "Sync Asana Now"}
        </Button>
      ) : null}
      {message ? <p className="text-xs text-zinc-400">{message}</p> : null}
    </div>
  );
}
