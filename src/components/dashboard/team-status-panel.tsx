"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Action = { eventType: "DAY_IN" | "DAY_OUT" | "BREAK_IN" | "BREAK_OUT"; enabled: boolean; reason?: string };
type CurrentPayload = {
  status: "Not Started" | "Working" | "On Break" | "Ended Day" | "Needs Review";
  last_event_type: Action["eventType"] | null;
  last_event_time_utc: string | null;
  last_event_time_local_label: string | null;
  available_actions: { dayAction: Action; breakAction: Action };
  active_work_seconds: number;
};

type FeedPayload = {
  events: Array<{
    id: string;
    userId: string;
    userDisplayName: string;
    userInitials: string;
    eventType: Action["eventType"];
    message: string;
    eventTimestampLocalLabel: string;
  }>;
  users: Array<{ id: string; displayName: string; email: string }>;
  companies: Array<{ id: string; name: string }>;
  requiresCompanyFilter: boolean;
};

function actionLabel(type: Action["eventType"]) {
  return type.replace("_", " ");
}

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const h = String(Math.floor(safe / 3600)).padStart(2, "0");
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function TeamStatusPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [current, setCurrent] = useState<CurrentPayload | null>(null);
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<Action["eventType"] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tick, setTick] = useState(0);
  const selectedUsersKey = selectedUsers.join(",");

  useEffect(() => {
    const timer = window.setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadCurrent = useCallback(async () => {
    const response = await fetch("/api/team-status/current", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load current status.");
    setCurrent(await response.json());
  }, []);

  const loadFeed = useCallback(async () => {
    const query = new URLSearchParams();
    if (isSuperAdmin && selectedCompanyId) query.set("company_id", selectedCompanyId);
    if (selectedUsers.length) query.set("user_ids", selectedUsers.join(","));
    const response = await fetch(`/api/team-status/feed?${query.toString()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load team feed.");
    setFeed(await response.json());
  }, [isSuperAdmin, selectedCompanyId, selectedUsers]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        await Promise.all([loadCurrent(), loadFeed()]);
        if (mounted) setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load team status.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    const refresh = window.setInterval(load, 5000);
    return () => {
      mounted = false;
      window.clearInterval(refresh);
    };
  }, [loadCurrent, loadFeed, selectedUsersKey]);

  const dayAction = current?.available_actions.dayAction;
  const breakAction = current?.available_actions.breakAction;

  const workClock = useMemo(() => {
    if (!current) return "00:00:00";
    const seconds = current.status === "Working" ? current.active_work_seconds + tick : current.active_work_seconds;
    return formatClock(seconds);
  }, [current, tick]);

  async function submitAction() {
    if (!pendingAction) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/team-status/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_type: pendingAction }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unable to submit status." }));
        throw new Error(payload.error ?? "Unable to submit status.");
      }
      setPendingAction(null);
      await Promise.all([loadCurrent(), loadFeed()]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit status.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {current?.status === "Not Started" ? (
        <Card className="border-indigo-500/40 bg-indigo-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-indigo-200">You have not started your workday yet.</p>
            <Button
              disabled={submitting}
              onClick={() => setPendingAction("DAY_IN")}
              className="px-4 py-2 text-sm"
            >
              DAY IN
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Workday Actions</h2>
          <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            Today Active Time: {workClock}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Button
            disabled={!dayAction?.enabled || submitting}
            onClick={() => dayAction && setPendingAction(dayAction.eventType)}
            className="py-3 text-base"
            title={dayAction?.reason}
          >
            {dayAction ? actionLabel(dayAction.eventType) : "DAY IN"}
          </Button>
          <Button
            variant="secondary"
            disabled={!breakAction?.enabled || submitting}
            onClick={() => breakAction && setPendingAction(breakAction.eventType)}
            className="py-3 text-base"
            title={breakAction?.reason}
          >
            {breakAction ? actionLabel(breakAction.eventType) : "BREAK IN"}
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-zinc-100">Team Status</h2>
          <div className="flex flex-wrap items-center gap-2">
            {isSuperAdmin ? (
              <select
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value)}
              >
                <option value="">Select company</option>
                {(feed?.companies ?? []).map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            ) : null}
            <select
              className="min-w-52 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
              multiple
              value={selectedUsers}
              onChange={(event) =>
                setSelectedUsers(Array.from(event.target.selectedOptions).map((option) => option.value))
              }
            >
              {(feed?.users ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
        {loading ? <p className="text-sm text-zinc-400">Loading feed...</p> : null}
        {feed?.requiresCompanyFilter ? (
          <p className="text-sm text-zinc-400">Select a company to view team status events.</p>
        ) : (
          <div className="space-y-2">
            {(feed?.events ?? []).map((event) => (
              <div key={event.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-100">
                    {event.userInitials}
                  </div>
                  <div>
                    <p className="text-sm text-zinc-100">{event.message}</p>
                    <p className="text-xs text-zinc-400">{event.eventTimestampLocalLabel}</p>
                  </div>
                </div>
              </div>
            ))}
            {!feed?.events.length ? <p className="text-sm text-zinc-500">No team status events for today or yesterday.</p> : null}
          </div>
        )}
      </Card>

      {pendingAction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card className="w-full max-w-sm p-5">
            <h3 className="text-lg font-semibold text-zinc-100">Confirm {actionLabel(pendingAction)}?</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Timestamp: {new Date().toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" disabled={submitting} onClick={() => setPendingAction(null)}>
                Cancel
              </Button>
              <Button disabled={submitting} onClick={submitAction}>
                {submitting ? "Submitting..." : `Confirm ${actionLabel(pendingAction)}`}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
