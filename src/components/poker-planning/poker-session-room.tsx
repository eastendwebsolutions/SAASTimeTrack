"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const POKER_VALUES = ["1", "2", "3", "5", "8", "13", "21", "34", "55", "?"];

type SessionDetail = {
  session: {
    id: string;
    title: string;
    status: "draft" | "active" | "completed" | "archived";
    currentVersion: number;
    writebackMode: string;
  };
  version: { id: string; versionNumber: number };
  canManage: boolean;
  stories: Array<{
    id: string;
    name: string;
    status: "pending" | "voting" | "revealed" | "finalized";
    ordering: number;
    finalEstimate: number | null;
  }>;
  participants: Array<{ userId: string; email: string; role: "facilitator" | "participant" }>;
  rounds: Array<{ id: string; storyId: string; roundNumber: number; state: "open" | "revealed" | "closed" }>;
  votes: Array<{ id: string; roundId: string; storyId: string; userId: string; voteValue: string }>;
  history: Array<{ id: string; actionType: string; createdAt: string }>;
};

export function PokerSessionRoom({ sessionId }: { sessionId: string }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [animPulse, setAnimPulse] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/poker-planning/sessions/${sessionId}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Failed to load session");
      setLoading(false);
      return;
    }
    setDetail(data);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    window.setTimeout(() => {
      void load();
    }, 0);
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_POKER_WS_URL;
    if (!base) return;
    const socket = new WebSocket(`${base}?sessionId=${sessionId}`);
    socket.onmessage = () => {
      void load();
    };
    return () => socket.close();
  }, [load, sessionId]);

  const activeStory = useMemo(() => detail?.stories.find((story) => story.status === "voting") ?? null, [detail]);
  const activeRound = useMemo(() => {
    if (!detail || !activeStory) return null;
    return detail.rounds
      .filter((round) => round.storyId === activeStory.id)
      .sort((a, b) => b.roundNumber - a.roundNumber)[0];
  }, [detail, activeStory]);
  const activeVotes = useMemo(() => {
    if (!detail || !activeRound) return [];
    return detail.votes.filter((vote) => vote.roundId === activeRound.id);
  }, [detail, activeRound]);

  async function vote(value: string) {
    if (!activeStory) return;
    setSelectedVote(value);
    setAnimPulse(true);
    await fetch(`/api/poker-planning/sessions/${sessionId}/stories/${activeStory.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voteValue: value }),
    });
    window.setTimeout(() => setAnimPulse(false), 250);
    await load();
  }

  async function adminAction(path: string, body?: object) {
    const response = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "Action failed");
    }
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-400">Loading session...</p>;
  if (error || !detail) return <p className="text-sm text-rose-300">{error ?? "Unable to load session"}</p>;

  const allVotesSubmitted = activeRound ? activeVotes.length >= detail.participants.length : false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{detail.session.title}</h1>
          <p className="text-xs text-zinc-400">
            Version {detail.version.versionNumber} · Status {detail.session.status} · Writeback {detail.session.writebackMode}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/poker-planning/history" className="rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700">
            History
          </Link>
          {detail.canManage && detail.session.status === "draft" ? (
            <Button onClick={() => adminAction(`/api/poker-planning/sessions/${sessionId}/start`)}>Start Session</Button>
          ) : null}
          {detail.canManage && detail.session.status === "active" ? (
            <Button onClick={() => adminAction(`/api/poker-planning/sessions/${sessionId}/complete`)}>Complete Session</Button>
          ) : null}
        </div>
      </div>

      <Card
        className={`p-5 transition ${
          detail.session.status === "completed" ? "ring-2 ring-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.35)] animate-pulse" : ""
        }`}
      >
        <h2 className="mb-3 text-lg font-medium">Stories</h2>
        <div className="space-y-2">
          {detail.stories.map((story) => (
            <div
              key={story.id}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                story.status === "finalized"
                  ? "border-emerald-700 bg-emerald-950/30 shadow-[0_0_14px_rgba(16,185,129,0.2)]"
                  : story.status === "voting"
                    ? "border-indigo-600 bg-indigo-950/30"
                    : "border-zinc-800 bg-zinc-950/60"
              }`}
            >
              <div className="flex items-center justify-between">
                <span>{story.name}</span>
                <span className="text-xs uppercase text-zinc-400">
                  {story.status}
                  {story.finalEstimate ? ` · ${story.finalEstimate}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {activeStory ? (
        <Card className={`p-5 transition ${allVotesSubmitted ? "border-amber-400/70 bg-amber-950/20" : ""}`}>
          <h2 className="text-lg font-medium">Active Story</h2>
          <p className="mt-1 text-sm text-zinc-300">{activeStory.name}</p>
          <div className="mt-4 grid grid-cols-5 gap-2 md:grid-cols-10">
            {POKER_VALUES.map((value) => (
              <button
                key={value}
                onClick={() => vote(value)}
                className={`rounded-md border px-3 py-2 text-sm transition ${
                  selectedVote === value ? "border-indigo-400 bg-indigo-600/30" : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                } ${animPulse && selectedVote === value ? "animate-pulse" : ""}`}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-400">
              {activeVotes.length}/{detail.participants.length} votes submitted
            </span>
            {detail.canManage ? (
              <>
                <Button variant="secondary" onClick={() => adminAction(`/api/poker-planning/sessions/${sessionId}/stories/${activeStory.id}/reveal`)}>
                  Reveal Votes
                </Button>
                <Button variant="secondary" onClick={() => adminAction(`/api/poker-planning/sessions/${sessionId}/stories/${activeStory.id}/revote`)}>
                  Revote
                </Button>
                <Button
                  onClick={() =>
                    adminAction(`/api/poker-planning/sessions/${sessionId}/stories/${activeStory.id}/finalize`, {
                      estimate: Number(selectedVote ?? "1"),
                    })
                  }
                >
                  Finalize Estimate
                </Button>
              </>
            ) : (
              <p className="text-xs text-zinc-500">Read-only controls for non-admin users.</p>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
