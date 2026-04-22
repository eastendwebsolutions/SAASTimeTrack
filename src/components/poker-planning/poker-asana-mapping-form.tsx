"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Mapping = {
  sprintFieldGid: string | null;
  sprintFieldName: string | null;
  storyPointsFieldGid: string | null;
  storyPointsFieldName: string | null;
};

export function PokerAsanaMappingForm({ mapping }: { mapping: Mapping }) {
  const [sprintFieldGid, setSprintFieldGid] = useState(mapping.sprintFieldGid ?? "");
  const [sprintFieldName, setSprintFieldName] = useState(mapping.sprintFieldName ?? "");
  const [storyPointsFieldGid, setStoryPointsFieldGid] = useState(mapping.storyPointsFieldGid ?? "");
  const [storyPointsFieldName, setStoryPointsFieldName] = useState(mapping.storyPointsFieldName ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    const response = await fetch("/api/poker-planning/asana-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sprintFieldGid,
        sprintFieldName,
        storyPointsFieldGid,
        storyPointsFieldName,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Failed to save mapping");
      return;
    }
    setMessage("Mapping saved.");
  }

  return (
    <Card className="p-5">
      <form className="space-y-4" onSubmit={save}>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Sprint custom field GID</span>
          <input
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            value={sprintFieldGid}
            onChange={(event) => setSprintFieldGid(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Sprint custom field name</span>
          <input
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            value={sprintFieldName}
            onChange={(event) => setSprintFieldName(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Story Points custom field GID</span>
          <input
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            value={storyPointsFieldGid}
            onChange={(event) => setStoryPointsFieldGid(event.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Story Points custom field name</span>
          <input
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            value={storyPointsFieldName}
            onChange={(event) => setStoryPointsFieldName(event.target.value)}
            required
          />
        </label>
        {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <Button type="submit">Save Mapping</Button>
      </form>
    </Card>
  );
}
