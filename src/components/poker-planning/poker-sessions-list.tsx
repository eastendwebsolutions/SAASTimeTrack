"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Session = {
  id: string;
  title: string;
  status: string;
  selectedSprintValueName: string;
  writebackMode: string;
  currentVersion: number;
  updatedAt: string;
};

export function PokerSessionsList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/poker-planning/sessions", { cache: "no-store" });
      const data = await response.json();
      if (!active) return;
      if (!response.ok) {
        setError(data.error ?? "Failed to load sessions");
        return;
      }
      setSessions(data.sessions ?? []);
    }
    void load();
    const timer = window.setInterval(load, 6000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!sessions.length) return <p className="text-sm text-zinc-400">No poker sessions yet. Create your first session to begin planning.</p>;

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <Link
          key={session.id}
          href={`/poker-planning/sessions/${session.id}`}
          className="block rounded-lg border border-zinc-800 bg-zinc-950/70 p-4 transition hover:border-indigo-600 hover:bg-zinc-900"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-zinc-100">{session.title}</p>
              <p className="mt-1 text-xs text-zinc-400">
                Sprint: {session.selectedSprintValueName} · Version {session.currentVersion} · Writeback: {session.writebackMode}
              </p>
            </div>
            <span className="rounded-md bg-zinc-800 px-2 py-1 text-xs uppercase text-zinc-200">{session.status}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
