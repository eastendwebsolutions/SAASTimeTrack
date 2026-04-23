"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { IntegrationProvider } from "@/lib/integrations/provider";

const SYNC_REMINDER_INTERVAL_MS = 8 * 60 * 60 * 1000;

type Props = {
  provider: IntegrationProvider;
  connected: boolean;
  lastSyncLabel: string;
  lastSyncedAtIso: string | null;
  timezone: string;
};

function getReminderKey(userId: string, provider: IntegrationProvider) {
  return `saastimetrack:${provider}-sync-reminder:last-prompt:${userId}`;
}

export function AsanaHeaderStatus({ provider, connected, lastSyncLabel, lastSyncedAtIso, timezone }: Props) {
  const { userId } = useAuth();
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const providerLabel = provider === "jira" ? "Jira" : "Asana";
  const syncEndpoint = provider === "jira" ? "/api/jira/sync/initial" : "/api/asana/sync/initial";
  const integrationSettingsHref = "/settings/integrations";

  async function syncNow() {
    setMessage(null);
    setIsSyncing(true);
    try {
      const response = await fetch(syncEndpoint, { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as {
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
        return;
      }
      if (data.summary?.diagnostics || data.debugBuild) {
        setMessage(
          `${data.debugBuild ? `Build: ${data.debugBuild}` : ""}${data.debugBuild && data.summary?.diagnostics ? " | " : ""}${data.summary?.diagnostics ? `Debug: assigned(workspace) ${data.summary.diagnostics.workspaceAssignedFetched}, candidates ${data.summary.diagnostics.assignedSubtasksCandidate}, resolved ${data.summary.diagnostics.assignedSubtasksResolvedToProject}` : ""}`,
        );
      }
      setShowReminder(false);
      router.refresh();
    } finally {
      setIsSyncing(false);
    }
  }

  const lastSyncedAtMs = useMemo(() => {
    if (!lastSyncedAtIso) return 0;
    const parsed = Date.parse(lastSyncedAtIso);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [lastSyncedAtIso]);

  useEffect(() => {
    if (!userId || !connected) return;

    const reminderKey = getReminderKey(userId, provider);

    const evaluateReminder = () => {
      const now = Date.now();
      const hasExceededSyncAge = now - lastSyncedAtMs >= SYNC_REMINDER_INTERVAL_MS;
      if (!hasExceededSyncAge) {
        setShowReminder(false);
        return;
      }

      const lastPromptRaw = window.localStorage.getItem(reminderKey);
      const lastPromptMs = lastPromptRaw ? Number(lastPromptRaw) : 0;
      const canPromptAgain = !Number.isFinite(lastPromptMs) || now - lastPromptMs >= SYNC_REMINDER_INTERVAL_MS;
      setShowReminder(canPromptAgain);
    };

    evaluateReminder();
    const timer = window.setInterval(evaluateReminder, 60_000);
    return () => window.clearInterval(timer);
  }, [connected, lastSyncedAtMs, provider, userId]);

  function remindLater() {
    if (userId) {
      window.localStorage.setItem(getReminderKey(userId, provider), String(Date.now()));
    }
    setShowReminder(false);
  }

  async function syncFromReminder() {
    if (userId) {
      window.localStorage.setItem(getReminderKey(userId, provider), String(Date.now()));
    }
    await syncNow();
  }

  return (
    <>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300">
        <p className="font-medium text-zinc-100">{providerLabel}: {connected ? "Connected" : "Not Connected"}</p>
        <p>Last sync: {lastSyncLabel}</p>
        <p>Timezone: {timezone}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {connected ? (
            <Button
              type="button"
              variant="secondary"
              className="px-2 py-1 text-xs"
              disabled={isSyncing}
              onClick={() => void syncNow()}
            >
              {isSyncing ? "Syncing..." : `Sync ${providerLabel}`}
            </Button>
          ) : (
            <Link
              href={integrationSettingsHref}
              className="inline-flex rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-100 transition hover:bg-zinc-700"
            >
              {`Connect ${providerLabel}`}
            </Link>
          )}
        </div>
        {message ? <p className="mt-1 text-[11px] text-rose-400">{message}</p> : null}
      </div>
      {showReminder ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-zinc-100">Asana sync reminder</h2>
            <p className="mt-2 text-sm text-zinc-300">
              {providerLabel} data has not been synced in over 8 hours. Sync now to keep project and task options current.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={remindLater}>
                Later
              </Button>
              <Button type="button" disabled={isSyncing} onClick={() => void syncFromReminder()}>
                {isSyncing ? "Syncing..." : `Sync ${providerLabel} now`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
