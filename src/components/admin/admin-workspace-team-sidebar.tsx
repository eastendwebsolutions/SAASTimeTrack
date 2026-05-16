"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

type RosterMember = {
  userId: string;
  email: string;
  displayName: string;
  initials: string;
  role: string;
  status: "Not Started" | "Working" | "On Break" | "Ended Day" | "Needs Review";
  lastEventType: "DAY_IN" | "DAY_OUT" | "BREAK_IN" | "BREAK_OUT" | null;
  lastEventTimeLocalLabel: string | null;
  activeWorkSeconds: number;
  loggedMinutesToday: number;
};

type RosterPayload = {
  dateKey: string;
  timezone: string;
  memberCount: number;
  members: RosterMember[];
};

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const h = String(Math.floor(safe / 3600)).padStart(2, "0");
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatLoggedMinutes(minutes: number) {
  const safe = Math.max(0, minutes);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function lastEventLabel(type: RosterMember["lastEventType"]) {
  if (!type) return "No events today";
  if (type === "DAY_IN") return "Day In";
  if (type === "DAY_OUT") return "Day Out";
  if (type === "BREAK_IN") return "Break In";
  if (type === "BREAK_OUT") return "Break Out";
  return type;
}

function statusStyles(status: RosterMember["status"]) {
  if (status === "Working") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (status === "On Break") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (status === "Ended Day") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (status === "Needs Review") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  return "border-zinc-600 bg-zinc-800/60 text-zinc-300";
}

type AdminWorkspaceTeamSidebarProps = {
  /** App user ids allowed in Team Today (same company as the admin). */
  allowedUserIds?: string[];
  /** App user ids with revoked SAASTimeTrack access (from admin Users list). */
  revokedUserIds?: string[];
};

export function AdminWorkspaceTeamSidebar({
  allowedUserIds,
  revokedUserIds = [],
}: AdminWorkspaceTeamSidebarProps) {
  const [roster, setRoster] = useState<RosterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const loadRoster = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/workspace-roster", { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Unable to load team roster.");
      }
      setRoster((await response.json()) as RosterPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load team roster.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoster();
    const refreshTimer = window.setInterval(() => void loadRoster(), 30_000);
    const tickTimer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(tickTimer);
    };
  }, [loadRoster]);

  const allowedIdSet = useMemo(() => (allowedUserIds ? new Set(allowedUserIds) : null), [allowedUserIds]);
  const revokedIdSet = useMemo(() => new Set(revokedUserIds), [revokedUserIds]);
  const members = useMemo(
    () =>
      (roster?.members ?? []).filter((member) => {
        if (allowedIdSet && !allowedIdSet.has(member.userId)) return false;
        return !revokedIdSet.has(member.userId);
      }),
    [allowedIdSet, revokedIdSet, roster?.members],
  );
  const workingCount = useMemo(() => members.filter((member) => member.status === "Working").length, [members]);

  return (
    <Card className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden border-zinc-800 bg-zinc-950/80 p-0">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Team today</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              {roster ? `${roster.dateKey} · ${roster.timezone.replace("America/", "")}` : "Eastern time"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void loadRoster();
            }}
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-400">
          {workingCount} working · {members.length} on your team
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && !roster ? <p className="px-1 text-sm text-zinc-500">Loading team…</p> : null}
        {error ? <p className="px-1 text-sm text-rose-300">{error}</p> : null}
        {!loading && !error && members.length === 0 ? (
          <p className="px-1 text-sm text-zinc-500">No users in this workspace.</p>
        ) : null}

        <ul className="space-y-2">
          {members.map((member) => {
            const liveSeconds =
              member.status === "Working" ? member.activeWorkSeconds + tick : member.activeWorkSeconds;
            return (
              <li
                key={member.userId}
                className="rounded-lg border border-zinc-800/90 bg-zinc-900/50 px-3 py-2.5"
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-100">
                    {member.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100" title={member.displayName}>
                      {member.displayName}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500" title={member.email}>
                      {member.email}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          statusStyles(member.status),
                        )}
                      >
                        {member.status}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                      <div>
                        <dt className="text-zinc-500">Active</dt>
                        <dd className="font-mono text-zinc-200">{formatClock(liveSeconds)}</dd>
                      </div>
                      <div>
                        <dt className="text-zinc-500">Logged</dt>
                        <dd className="font-mono text-zinc-200">{formatLoggedMinutes(member.loggedMinutesToday)}</dd>
                      </div>
                    </dl>
                    <p className="mt-1.5 text-[10px] text-zinc-500">
                      {lastEventLabel(member.lastEventType)}
                      {member.lastEventTimeLocalLabel ? ` · ${member.lastEventTimeLocalLabel}` : ""}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
