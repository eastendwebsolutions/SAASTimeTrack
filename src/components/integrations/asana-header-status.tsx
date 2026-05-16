"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { IntegrationLabel } from "@/components/integrations/integration-label";
import { IntegrationLogo } from "@/components/integrations/integration-logo";
import { cn } from "@/lib/utils/cn";

const SYNC_REMINDER_INTERVAL_MS = 8 * 60 * 60 * 1000;

type Props = {
  provider: "asana" | "jira" | "monday";
  connected: boolean;
  integrationOptional?: boolean;
  lastSyncLabel: string;
  lastSyncedAtIso: string | null;
  timezone: string;
  variant?: "full" | "compact";
};

function getReminderKey(userId: string) {
  return `whosaas:asana-sync-reminder:last-prompt:${userId}`;
}

function providerLabel(provider: Props["provider"]) {
  return `${provider[0].toUpperCase()}${provider.slice(1)}`;
}

function shortTimezone(timezone: string) {
  if (timezone === "America/New_York") return "ET";
  if (timezone === "America/Chicago") return "CT";
  if (timezone === "America/Denver") return "MT";
  if (timezone === "America/Los_Angeles") return "PT";
  return timezone.replace("America/", "").replace("_", " ");
}

export function AsanaHeaderStatus({
  provider,
  connected,
  integrationOptional = false,
  lastSyncLabel,
  lastSyncedAtIso,
  timezone,
  variant = "compact",
}: Props) {
  const { userId } = useAuth();
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ text: string; variant: "success" | "error" } | null>(null);
  const [showReminder, setShowReminder] = useState(false);

  async function syncNow() {
    setSyncFeedback(null);
    setIsSyncing(true);
    try {
      const response = await fetch(`/api/${provider}/sync/initial`, { method: "POST" });
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
        setSyncFeedback({
          text: data.details || data.error || "Sync failed.",
          variant: "error",
        });
        return;
      }
      if (provider === "asana" && (data.summary?.diagnostics || data.debugBuild)) {
        setSyncFeedback({
          text: `${data.debugBuild ? `Build: ${data.debugBuild}` : ""}${data.debugBuild && data.summary?.diagnostics ? " | " : ""}${data.summary?.diagnostics ? `Debug: assigned(workspace) ${data.summary.diagnostics.workspaceAssignedFetched}, candidates ${data.summary.diagnostics.assignedSubtasksCandidate}, resolved ${data.summary.diagnostics.assignedSubtasksResolvedToProject}` : ""}`,
          variant: "success",
        });
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
    if (!userId || provider !== "asana" || !connected) return;

    const reminderKey = getReminderKey(userId);

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
      window.localStorage.setItem(getReminderKey(userId), String(Date.now()));
    }
    setShowReminder(false);
  }

  async function syncFromReminder() {
    if (userId) {
      window.localStorage.setItem(getReminderKey(userId), String(Date.now()));
    }
    await syncNow();
  }

  const statusLabel = connected
    ? "Connected"
    : integrationOptional
      ? "Optional"
      : "Not connected";

  const panel = (
    <div className="space-y-2 p-3 text-xs text-zinc-300">
      <p className="font-medium text-zinc-100">
        <IntegrationLabel integration={provider} text={providerLabel(provider)} className="inline-flex items-center gap-1.5" />
      </p>
      <p>
        Status:{" "}
        <span className={connected ? "text-emerald-300" : "text-zinc-400"}>
          {connected ? "Connected" : integrationOptional ? "Optional (not connected)" : "Not connected"}
        </span>
      </p>
      <p>Last sync: {lastSyncLabel}</p>
      <p>Timezone: {timezone}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {connected ? (
          <Button
            type="button"
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={isSyncing}
            onClick={() => void syncNow()}
          >
            <IntegrationLabel integration={provider} text={isSyncing ? "Syncing…" : `Sync now`} />
          </Button>
        ) : integrationOptional ? (
          <Link
            href="/admin/review"
            className="inline-flex rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-100 transition hover:bg-zinc-700"
          >
            Open admin
          </Link>
        ) : (
          <Link
            href="/settings/integrations"
            className="inline-flex rounded-md bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-100 transition hover:bg-zinc-700"
          >
            <IntegrationLabel integration={provider} text={`Connect ${providerLabel(provider)}`} />
          </Link>
        )}
        <Link href="/settings/integrations" className="text-[11px] text-indigo-300 hover:text-indigo-200">
          Integration settings
        </Link>
      </div>
      {syncFeedback ? (
        <p
          className={cn(
            "text-[11px]",
            syncFeedback.variant === "success" && "text-emerald-400",
            syncFeedback.variant === "error" && "text-rose-400",
          )}
        >
          {syncFeedback.text}
        </p>
      ) : null}
    </div>
  );

  if (variant === "full") {
    return (
      <>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-300">{panel}</div>
        {provider === "asana" && showReminder ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
            <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
              <h2 className="text-lg font-semibold text-zinc-100">
                <IntegrationLabel integration="asana" text="Asana sync reminder" />
              </h2>
              <p className="mt-2 text-sm text-zinc-300">
                Your Asana data has not been synced in over 8 hours. Sync now to keep project and task options current.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={remindLater}>
                  Later
                </Button>
                <Button type="button" disabled={isSyncing} onClick={() => void syncFromReminder()}>
                  <IntegrationLabel integration="asana" text={isSyncing ? "Syncing..." : "Sync Asana now"} />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <details className="group relative">
        <summary
          className={cn(
            "flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-zinc-700/90 bg-zinc-900/80 px-2.5 text-xs text-zinc-200 transition",
            "hover:border-zinc-600 hover:bg-zinc-800/90",
            "[&::-webkit-details-marker]:hidden",
          )}
          title={`${providerLabel(provider)} · ${statusLabel} · ${shortTimezone(timezone)}`}
        >
          <IntegrationLogo integration={provider} className="h-4 w-4 shrink-0" />
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              connected ? "bg-emerald-400" : integrationOptional ? "bg-amber-400/80" : "bg-zinc-500",
            )}
            aria-hidden
          />
          <span className="hidden max-w-[7rem] truncate sm:inline">{statusLabel}</span>
        </summary>
        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-30 w-64 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
          {panel}
        </div>
      </details>
      {provider === "asana" && showReminder ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-zinc-100">
              <IntegrationLabel integration="asana" text="Asana sync reminder" />
            </h2>
            <p className="mt-2 text-sm text-zinc-300">
              Your Asana data has not been synced in over 8 hours. Sync now to keep project and task options current.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={remindLater}>
                Later
              </Button>
              <Button type="button" disabled={isSyncing} onClick={() => void syncFromReminder()}>
                <IntegrationLabel integration="asana" text={isSyncing ? "Syncing..." : "Sync Asana now"} />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
