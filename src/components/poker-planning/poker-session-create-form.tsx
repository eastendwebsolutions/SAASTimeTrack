"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type CompanyUser = {
  id: string;
  email: string;
  role: "user" | "company_admin" | "super_admin";
};

type Mapping = {
  sprintFieldGid: string | null;
  sprintFieldName: string | null;
  storyPointsFieldGid: string | null;
  storyPointsFieldName: string | null;
};

export function PokerSessionCreateForm({ users, mapping }: { users: CompanyUser[]; mapping: Mapping }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [asanaProjectId, setAsanaProjectId] = useState("");
  const [sprintFieldGid, setSprintFieldGid] = useState(mapping.sprintFieldGid ?? "");
  const [sprintFieldName, setSprintFieldName] = useState(mapping.sprintFieldName ?? "Sprint");
  const [selectedSprintValueGid, setSelectedSprintValueGid] = useState("");
  const [selectedSprintValueName, setSelectedSprintValueName] = useState("");
  const [writebackMode, setWritebackMode] = useState<"immediate" | "on_sprint_completion">("on_sprint_completion");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const participantOptions = useMemo(
    () => users.map((user) => ({ id: user.id, label: `${user.email} (${user.role})` })),
    [users],
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/poker-planning/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          asanaProjectId,
          sprintFieldGid,
          sprintFieldName,
          selectedSprintValueGid,
          selectedSprintValueName,
          writebackMode,
          participantUserIds: selectedParticipants,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to create session");
        return;
      }
      router.push(`/poker-planning/sessions/${data.session.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Session title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            required
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Asana project GID</span>
          <input
            value={asanaProjectId}
            onChange={(event) => setAsanaProjectId(event.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            required
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Sprint field GID</span>
            <input
              value={sprintFieldGid}
              onChange={(event) => setSprintFieldGid(event.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Sprint field name</span>
            <input
              value={sprintFieldName}
              onChange={(event) => setSprintFieldName(event.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
              required
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Selected sprint value GID</span>
            <input
              value={selectedSprintValueGid}
              onChange={(event) => setSelectedSprintValueGid(event.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Selected sprint value name</span>
            <input
              value={selectedSprintValueName}
              onChange={(event) => setSelectedSprintValueName(event.target.value)}
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
              required
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Writeback mode</span>
          <select
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            value={writebackMode}
            onChange={(event) => setWritebackMode(event.target.value as "immediate" | "on_sprint_completion")}
          >
            <option value="immediate">Immediate per story finalize</option>
            <option value="on_sprint_completion">When sprint session is completed</option>
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm text-zinc-300">Participants (must be added before start)</legend>
          <div className="grid gap-2 md:grid-cols-2">
            {participantOptions.map((user) => {
              const checked = selectedParticipants.includes(user.id);
              return (
                <label key={user.id} className="flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setSelectedParticipants((state) => [...state, user.id]);
                      } else {
                        setSelectedParticipants((state) => state.filter((item) => item !== user.id));
                      }
                    }}
                  />
                  <span>{user.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <Button type="submit" disabled={saving}>
          {saving ? "Creating..." : "Create Session"}
        </Button>
      </form>
    </Card>
  );
}
