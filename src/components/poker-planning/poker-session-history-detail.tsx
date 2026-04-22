"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SessionDetail = {
  session: { id: string; title: string; currentVersion: number };
  version: { versionNumber: number };
  canManage: boolean;
  stories: Array<{ id: string; name: string; status: string; finalEstimate: number | null }>;
  history: Array<{ id: string; actionType: string; createdAt: string }>;
};

export function PokerSessionHistoryDetail({ sessionId }: { sessionId: string }) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [selectedStories, setSelectedStories] = useState<string[]>([]);

  const load = useCallback(async (versionOverride?: number | null) => {
    const qs = versionOverride ? `?version=${versionOverride}` : "";
    const response = await fetch(`/api/poker-planning/sessions/${sessionId}${qs}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Failed to load detail");
      return;
    }
    setDetail(data);
    setError(null);
    setVersion(data.version.versionNumber);
  }, [sessionId]);

  useEffect(() => {
    window.setTimeout(() => {
      void load();
    }, 0);
  }, [load]);

  async function restart(scope: "full" | "stories") {
    const response = await fetch(`/api/poker-planning/sessions/${sessionId}/restart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restartScope: scope,
        storyIds: scope === "stories" ? selectedStories : undefined,
      }),
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "Restart failed");
      return;
    }
    await load();
  }

  if (error) return <p className="text-sm text-rose-300">{error}</p>;
  if (!detail) return <p className="text-sm text-zinc-400">Loading history detail...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{detail.session.title}</h1>
          <p className="text-xs text-zinc-400">Version selector (current: {detail.version.versionNumber})</p>
        </div>
        <Link href="/poker-planning/history" className="rounded-md bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700">
          Back
        </Link>
      </div>

      <Card className="p-5">
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-zinc-300">Version</span>
          <input
            type="number"
            min={1}
            value={version ?? detail.version.versionNumber}
            onChange={(event) => setVersion(Number(event.target.value))}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
          />
        </label>
        <Button variant="secondary" onClick={() => load(version)}>
          Load Version
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-lg font-medium">Stories (Read-only)</h2>
        <div className="space-y-2">
          {detail.stories.map((story) => (
            <label key={story.id} className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2">
              <span className="text-sm text-zinc-200">
                {story.name} · {story.status} {story.finalEstimate ? `· ${story.finalEstimate}` : ""}
              </span>
              {detail.canManage ? (
                <input
                  type="checkbox"
                  checked={selectedStories.includes(story.id)}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedStories((state) => [...state, story.id]);
                    } else {
                      setSelectedStories((state) => state.filter((id) => id !== story.id));
                    }
                  }}
                />
              ) : null}
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-lg font-medium">Action Timeline</h2>
        <div className="space-y-2">
          {detail.history.map((item) => (
            <p key={item.id} className="text-sm text-zinc-300">
              {new Date(item.createdAt).toLocaleString()} · {item.actionType}
            </p>
          ))}
        </div>
      </Card>

      {detail.canManage ? (
        <Card className="p-5">
          <h2 className="mb-3 text-lg font-medium">Admin Restart Controls</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => restart("full")}>
              Restart Entire Session
            </Button>
            <Button onClick={() => restart("stories")} disabled={!selectedStories.length}>
              Restart Selected Stories
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
