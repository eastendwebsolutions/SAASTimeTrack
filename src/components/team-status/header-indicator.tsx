"use client";

import { useEffect, useMemo, useState } from "react";

type CurrentPayload = {
  status: "Not Started" | "Working" | "On Break" | "Ended Day" | "Needs Review";
  last_event_type: "DAY_IN" | "DAY_OUT" | "BREAK_IN" | "BREAK_OUT" | null;
  last_event_time_utc: string | null;
  last_event_time_local_label: string | null;
  active_work_seconds: number;
};

function formatClock(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const h = String(Math.floor(safe / 3600)).padStart(2, "0");
  const m = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function statusStyles(status: CurrentPayload["status"]) {
  if (status === "Working") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  if (status === "On Break") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
  if (status === "Ended Day") return "bg-blue-500/20 text-blue-300 border-blue-500/40";
  if (status === "Needs Review") return "bg-rose-500/20 text-rose-300 border-rose-500/40";
  return "bg-zinc-700/30 text-zinc-300 border-zinc-600";
}

export function TeamStatusHeaderIndicator() {
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
    return <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-400">{error ?? "Loading status..."}</div>;
  }

  return (
    <div className={`rounded-md border px-3 py-2 text-xs ${statusStyles(data.status)}`} title={data.last_event_type ?? "No status event yet"}>
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
