"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type EntryRow = {
  id: string;
  projectId: string;
  taskId: string;
  subtaskId: string | null;
  entryDate: string;
  timeIn: string;
  timeOut: string;
  summary: string;
  status: string;
};

type ProjectRow = { id: string; name: string };
type TaskRow = { id: string; name: string; projectId: string; parentTaskId: string | null };

type Props = {
  entries: EntryRow[];
  projects: ProjectRow[];
  tasks: TaskRow[];
  timezone: string;
};

export function TimesheetDetailEditor({ entries, projects, tasks, timezone }: Props) {
  const [rows, setRows] = useState(entries);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());

  const topLevelTasksByProject = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      if (task.parentTaskId) continue;
      const list = map.get(task.projectId) ?? [];
      list.push(task);
      map.set(task.projectId, list);
    }
    return map;
  }, [tasks]);

  const subtasksByParent = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      if (!task.parentTaskId) continue;
      const list = map.get(task.parentTaskId) ?? [];
      list.push(task);
      map.set(task.parentTaskId, list);
    }
    return map;
  }, [tasks]);

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function saveRow(id: string) {
    const row = rows.find((item) => item.id === id);
    if (!row) return;

    setPendingId(id);
    try {
      const response = await fetch(`/api/time-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: row.projectId,
          taskId: row.taskId,
          subtaskId: row.subtaskId,
          entryDate: row.entryDate,
          timeIn: row.timeIn,
          timeOut: row.timeOut,
          summary: row.summary,
        }),
      });
      if (response.ok) {
        setEditingIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    } finally {
      setPendingId(null);
    }
  }

  function startEditing(id: string) {
    setEditingIds((current) => new Set(current).add(id));
  }

  function cancelEditing(id: string) {
    const original = entries.find((entry) => entry.id === id);
    if (original) {
      setRows((current) =>
        current.map((row) =>
          row.id === id
            ? {
                ...row,
                projectId: original.projectId,
                taskId: original.taskId,
                subtaskId: original.subtaskId,
                entryDate: original.entryDate,
                timeIn: original.timeIn,
                timeOut: original.timeOut,
                summary: original.summary,
              }
            : row,
        ),
      );
    }
    setEditingIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  function ReadCell({ value }: { value: string }) {
    return <div className="py-2 text-zinc-200">{value || "-"}</div>;
  }

  function formatLocalDateFromIso(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(parsed);
  }

  function formatLocalDateTimeFromIso(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleString("en-US", { timeZone: timezone });
  }

  function isoToDateTimeLocalInput(value: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const hours = String(parsed.getHours()).padStart(2, "0");
    const minutes = String(parsed.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="min-w-[1320px] w-full text-sm">
        <thead className="bg-zinc-900/80 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2 min-w-[180px]">Project</th>
            <th className="px-3 py-2 min-w-[180px]">Task</th>
            <th className="px-3 py-2 min-w-[180px]">Subtask</th>
            <th className="px-3 py-2 min-w-[130px]">Date</th>
            <th className="px-3 py-2 min-w-[190px]">Time In</th>
            <th className="px-3 py-2 min-w-[190px]">Time Out</th>
            <th className="px-3 py-2 min-w-[260px]">Summary</th>
            <th className="px-3 py-2 min-w-[100px]">Status</th>
            <th className="px-3 py-2 min-w-[110px] text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const topLevelTasks = topLevelTasksByProject.get(row.projectId) ?? [];
            const subtasks = subtasksByParent.get(row.taskId) ?? [];
            const isEditing = editingIds.has(row.id);
            const projectName = projects.find((project) => project.id === row.projectId)?.name ?? row.projectId;
            const taskName = tasks.find((task) => task.id === row.taskId)?.name ?? row.taskId;
            const subtaskName = row.subtaskId ? tasks.find((task) => task.id === row.subtaskId)?.name ?? row.subtaskId : "-";
            return (
              <tr key={row.id} className="border-t border-zinc-800 align-top">
                <td className="px-3 py-2">
                  {isEditing ? (
                    <select
                      className="w-full rounded border border-zinc-700 bg-zinc-950 p-2"
                      value={row.projectId}
                      onChange={(event) => updateRow(row.id, { projectId: event.target.value, taskId: "", subtaskId: null })}
                    >
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <ReadCell value={projectName} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <select
                      className="w-full rounded border border-zinc-700 bg-zinc-950 p-2"
                      value={row.taskId}
                      onChange={(event) => updateRow(row.id, { taskId: event.target.value, subtaskId: null })}
                    >
                      {topLevelTasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <ReadCell value={taskName} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <select
                      className="w-full rounded border border-zinc-700 bg-zinc-950 p-2"
                      value={row.subtaskId ?? ""}
                      onChange={(event) => updateRow(row.id, { subtaskId: event.target.value || null })}
                    >
                      <option value="">None</option>
                      {subtasks.map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <ReadCell value={subtaskName} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      type="date"
                      className="w-full rounded border border-zinc-700 bg-zinc-950 p-2"
                      value={row.entryDate}
                      onChange={(event) => updateRow(row.id, { entryDate: event.target.value })}
                    />
                  ) : (
                    <ReadCell value={formatLocalDateFromIso(row.timeIn)} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      type="datetime-local"
                      className="w-full rounded border border-zinc-700 bg-zinc-950 p-2"
                      value={isoToDateTimeLocalInput(row.timeIn)}
                      onChange={(event) =>
                        updateRow(row.id, { timeIn: event.target.value ? new Date(event.target.value).toISOString() : row.timeIn })
                      }
                    />
                  ) : (
                    <ReadCell value={formatLocalDateTimeFromIso(row.timeIn)} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      type="datetime-local"
                      className="w-full rounded border border-zinc-700 bg-zinc-950 p-2"
                      value={isoToDateTimeLocalInput(row.timeOut)}
                      onChange={(event) =>
                        updateRow(row.id, { timeOut: event.target.value ? new Date(event.target.value).toISOString() : row.timeOut })
                      }
                    />
                  ) : (
                    <ReadCell value={formatLocalDateTimeFromIso(row.timeOut)} />
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      className="w-full rounded border border-zinc-700 bg-zinc-950 p-2"
                      value={row.summary}
                      onChange={(event) => updateRow(row.id, { summary: event.target.value })}
                    />
                  ) : (
                    <ReadCell value={row.summary} />
                  )}
                </td>
                <td className="px-3 py-2 capitalize whitespace-nowrap">{row.status}</td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="secondary" onClick={() => cancelEditing(row.id)}>
                        Cancel
                      </Button>
                      <Button type="button" onClick={() => saveRow(row.id)} disabled={pendingId === row.id}>
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Button type="button" variant="secondary" onClick={() => startEditing(row.id)}>
                      Edit
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
