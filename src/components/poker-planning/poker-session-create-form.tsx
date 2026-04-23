"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IntegrationLabel } from "@/components/integrations/integration-label";

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

type SprintOption = { gid: string; name: string };

export function PokerSessionCreateForm({ users, mapping }: { users: CompanyUser[]; mapping: Mapping }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [asanaWorkspaceId, setAsanaWorkspaceId] = useState("");
  const [asanaProjectId, setAsanaProjectId] = useState("");
  const [sprintFieldGid, setSprintFieldGid] = useState(mapping.sprintFieldGid ?? "");
  const [sprintFieldName, setSprintFieldName] = useState(mapping.sprintFieldName ?? "Sprint");
  const [selectedSprintValueGid, setSelectedSprintValueGid] = useState("");
  const [selectedSprintValueName, setSelectedSprintValueName] = useState("");
  const [storyPointsFieldGid, setStoryPointsFieldGid] = useState(mapping.storyPointsFieldGid ?? "");
  const [storyPointsFieldName, setStoryPointsFieldName] = useState(mapping.storyPointsFieldName ?? "Story Points");
  const [sprintOptions, setSprintOptions] = useState<SprintOption[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [needsManualMapping, setNeedsManualMapping] = useState(false);
  const [showManualMapping, setShowManualMapping] = useState(false);
  const [writebackMode, setWritebackMode] = useState<"immediate" | "on_sprint_completion">("on_sprint_completion");
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const participantOptions = useMemo(
    () => users.map((user) => ({ id: user.id, label: `${user.email} (${user.role})` })),
    [users],
  );

  async function detectFieldsFromProject(projectGid: string) {
    if (!projectGid.trim()) return;
    setDetecting(true);
    setError(null);
    try {
      const response = await fetch(`/api/poker-planning/asana-fields?projectGid=${encodeURIComponent(projectGid)}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Failed to detect Asana fields");
        setNeedsManualMapping(true);
        setShowManualMapping(true);
        return;
      }

      if (data.sprint) {
        setSprintFieldGid(data.sprint.gid);
        setSprintFieldName(data.sprint.name);
        setSprintOptions(data.sprint.enumOptions ?? []);
      }
      if (data.storyPoints) {
        setStoryPointsFieldGid(data.storyPoints.gid);
        setStoryPointsFieldName(data.storyPoints.name);
      }
      setAsanaWorkspaceId(data.workspaceGid ?? "");
      const needsManual = Boolean(data.needsManualMapping);
      setNeedsManualMapping(needsManual);
      setShowManualMapping(needsManual);
    } finally {
      setDetecting(false);
    }
  }

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
          asanaWorkspaceId,
          asanaProjectId,
          sprintFieldGid,
          sprintFieldName,
          selectedSprintValueGid,
          selectedSprintValueName,
          storyPointsFieldGid,
          storyPointsFieldName,
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
          <span className="mb-1 block text-zinc-300">
            <IntegrationLabel integration="asana" text="Detected Asana workspace" />
          </span>
          <input
            value={asanaWorkspaceId}
            onChange={(event) => setAsanaWorkspaceId(event.target.value)}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            required
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">
            <IntegrationLabel integration="asana" text="Asana project GID" />
          </span>
          <input
            value={asanaProjectId}
            onChange={(event) => setAsanaProjectId(event.target.value)}
            onBlur={(event) => {
              void detectFieldsFromProject(event.target.value);
            }}
            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
            required
          />
          <span className="mt-1 block text-xs text-zinc-500">
            We auto-detect Sprint and Story Points fields from this project.
          </span>
        </label>

        {detecting ? <p className="text-xs text-zinc-400"><IntegrationLabel integration="asana" text="Detecting Asana custom fields..." /></p> : null}
        {!needsManualMapping && sprintFieldGid ? (
          <p className="rounded-md border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">
            Auto-detected mapping: Sprint `{sprintFieldName}` and Story Points `{storyPointsFieldName}`.
          </p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {sprintOptions.length ? (
            <label className="block text-sm">
              <span className="mb-1 block text-zinc-300">Sprint</span>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
                value={selectedSprintValueGid}
                onChange={(event) => {
                  const gid = event.target.value;
                  const option = sprintOptions.find((item) => item.gid === gid);
                  setSelectedSprintValueGid(gid);
                  setSelectedSprintValueName(option?.name ?? "");
                }}
                required
              >
                <option value="">Select sprint</option>
                {sprintOptions.map((option) => (
                  <option key={option.gid} value={option.gid}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
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
            </>
          )}
        </div>

        {needsManualMapping ? (
          <p className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
            Auto-detection is incomplete or ambiguous. Update mapping below or in{" "}
            <Link className="underline" href="/poker-planning/settings">
              <IntegrationLabel integration="asana" text="Asana Mapping" />
            </Link>
            .
          </p>
        ) : null}
        {!needsManualMapping ? (
          <button
            type="button"
            className="text-xs text-zinc-400 underline"
            onClick={() => setShowManualMapping((state) => !state)}
          >
            {showManualMapping ? "Hide manual mapping override" : "Show manual mapping override"}
          </button>
        ) : null}

        {(showManualMapping || !sprintFieldGid || !storyPointsFieldGid) ? (
          <div className="space-y-3 rounded-md border border-zinc-800 p-3">
            <p className="text-sm font-medium text-zinc-200">Manual mapping override</p>
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
                <span className="mb-1 block text-zinc-300">Story Points field GID</span>
                <input
                  value={storyPointsFieldGid}
                  onChange={(event) => setStoryPointsFieldGid(event.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-zinc-300">Story Points field name</span>
                <input
                  value={storyPointsFieldName}
                  onChange={(event) => setStoryPointsFieldName(event.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2"
                  required
                />
              </label>
            </div>
          </div>
        ) : null}

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
