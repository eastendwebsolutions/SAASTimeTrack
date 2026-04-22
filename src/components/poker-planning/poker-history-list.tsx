"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Session = {
  id: string;
  title: string;
  currentVersion: number;
  selectedSprintValueName: string;
  completedAt: string | null;
};

export function PokerHistoryList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/poker-planning/history", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to load history");
        return;
      }
      setSessions(data.sessions ?? []);
    }
    void load();
  }, []);

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!sessions.length) return <p className="text-sm text-zinc-400">No completed sessions yet.</p>;

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <Link
          key={session.id}
          href={`/poker-planning/history/${session.id}`}
          className="block rounded-md border border-zinc-800 bg-zinc-950/60 p-4 transition hover:border-zinc-600"
        >
          <p className="font-medium text-zinc-100">{session.title}</p>
          <p className="mt-1 text-xs text-zinc-400">
            Sprint: {session.selectedSprintValueName} · Version {session.currentVersion} · Completed{" "}
            {session.completedAt ? new Date(session.completedAt).toLocaleString() : "N/A"}
          </p>
        </Link>
      ))}
    </div>
  );
}
