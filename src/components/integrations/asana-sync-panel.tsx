"use client";

import { useState } from "react";
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
};

export function AsanaSyncPanel({ connected, initialRun }: Props) {
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
        summary?: { projectsSynced: number; tasksSynced: number; subtasksSynced: number };
        error?: string;
        details?: string;
      };
      if (!response.ok || !data.ok) {
        setMessage(data.details || data.error || "Sync failed.");
      } else {
        setMessage(
          `Sync complete. Projects: ${data.summary?.projectsSynced ?? 0}, Tasks: ${data.summary?.tasksSynced ?? 0}, Subtasks: ${data.summary?.subtasksSynced ?? 0}`,
        );
      }
      await refreshStatus();
    } finally {
      setIsSyncing(false);
    }
  }

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
