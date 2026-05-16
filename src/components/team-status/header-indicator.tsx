"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";

type CurrentPayload = {
  status: "Not Started" | "Working" | "On Break" | "Ended Day" | "Needs Review";
  last_event_type: "DAY_IN" | "DAY_OUT" | "BREAK_IN" | "BREAK_OUT" | null;
  last_event_time_utc: string | null;
  last_event_time_local_label: string | null;
  active_work_seconds: number;
};

type Props = {
  variant?: "full" | "compact";
};

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const h = String(Math.floor(safe / 3600)).padStart(2, "0");
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function statusStyles(status: CurrentPayload["status"]) {
  if (status === "Working") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (status === "On Break") return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (status === "Ended Day") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (status === "Needs Review") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  return "border-zinc-600 bg-zinc-800/60 text-zinc-300";
}

export function TeamStatusHeaderIndicator({ variant = "compact" }: Props) {
  const [data, setData] = useState<CurrentPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const response = await fetch("/api/team-status/current", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load status");
        const payload: CurrentPayload = await response.json();
        if (!mounted) return;
        setData(payload);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load status");
      }
    }
    load();
    const refresh = window.setInterval(load, 30000);
    return () => {
      mounted = false;
      window.clearInterval(refresh);
    };
  }, []);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeSeconds = useMemo(() => {
    if (!data) return 0;
    return data.status === "Working" ? data.active_work_seconds + tick : data.active_work_seconds;
  }, [data, tick]);

  if (!data) {
    return (
      <div
        className={cn(
          "rounded-full border border-zinc-700 bg-zinc-900/80 text-xs text-zinc-400",
          variant === "compact" ? "h-9 px-3 leading-9" : "px-3 py-2",
        )}
      >
        {error ?? "Loading…"}
      </div>
    );
  }

  const detail = (
    <div className="space-y-1.5 p-3 text-xs">
      <p className="font-medium">{data.status}</p>
      <p className="text-zinc-400">
        {data.last_event_time_local_label ? `Last event: ${data.last_event_time_local_label}` : "No status event submitted today"}
      </p>
      <p className="font-mono text-zinc-200">Work time: {formatClock(activeSeconds)}</p>
      <Link href="/dashboard" className="inline-block text-indigo-300 hover:text-indigo-200">
        Open dashboard
      </Link>
    </div>
  );

  if (variant === "full") {
    return (
      <div className={cn("rounded-md border px-3 py-2 text-xs", statusStyles(data.status))} title={data.last_event_type ?? "No status event yet"}>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-current" />
          <span className="font-semibold">{data.status}</span>
        </div>
        <p className="mt-1 text-[11px] opacity-85">
          {data.last_event_time_local_label ? `Last: ${data.last_event_time_local_label}` : "No status event submitted"}
        </p>
        <p className="text-[11px] opacity-85">Work Time: {formatClock(activeSeconds)}</p>
      </div>
    );
  }

  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border px-2.5 text-xs transition",
          statusStyles(data.status),
          "hover:brightness-110",
          "[&::-webkit-details-marker]:hidden",
        )}
        title={data.last_event_time_local_label ?? "Team status"}
      >
        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-current" aria-hidden />
        <span className="max-w-[5.5rem] truncate font-medium sm:max-w-none">{data.status}</span>
        <span className="hidden font-mono text-[11px] opacity-90 sm:inline">{formatClock(activeSeconds)}</span>
      </summary>
      <div className={cn("absolute right-0 top-[calc(100%+0.35rem)] z-30 w-56 overflow-hidden rounded-lg border shadow-xl", statusStyles(data.status))}>
        {detail}
      </div>
    </details>
  );
}
