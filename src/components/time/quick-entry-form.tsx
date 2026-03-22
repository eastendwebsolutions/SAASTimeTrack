"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type ProjectOption = {
  id: string;
  name: string;
};

type TaskOption = {
  id: string;
  name: string;
  projectId: string;
  parentTaskId: string | null;
};

type Props = {
  projects: ProjectOption[];
  tasks: TaskOption[];
};

type Segment = {
  start: Date;
  end: Date;
};

type SegmentChunk = {
  start: Date;
  end: Date;
  entryDate: string;
};

function toLocalDateValue(date = new Date()) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  const local = new Date(date.getTime() - offsetMs);
  return local.toISOString().slice(0, 10);
}

function isSameLocalDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatElapsed(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = String(Math.floor(safeSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safeSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function splitSegmentByDay(segment: Segment): SegmentChunk[] {
  const chunks: SegmentChunk[] = [];
  let cursor = new Date(segment.start);
  const finalEnd = new Date(segment.end);

  while (cursor.getTime() < finalEnd.getTime()) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(23, 59, 59, 999);
    const chunkEnd = dayEnd.getTime() < finalEnd.getTime() ? dayEnd : finalEnd;
    chunks.push({
      start: new Date(cursor),
      end: new Date(chunkEnd),
      entryDate: toLocalDateValue(cursor),
    });
    cursor = new Date(chunkEnd.getTime() + 1);
  }

  return chunks;
}

export function QuickEntryForm({ projects, tasks }: Props) {
  const [projectSearch, setProjectSearch] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [subtaskSearch, setSubtaskSearch] = useState("");
  const [summary, setSummary] = useState("");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [timerNow, setTimerNow] = useState<Date>(new Date());
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!startedAt) {
      return;
    }

    const interval = window.setInterval(() => setTimerNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  const filteredProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => project.name.toLowerCase().includes(query));
  }, [projectSearch, projects]);

  const selectedProject = useMemo(() => {
    const normalized = projectSearch.trim().toLowerCase();
    if (!normalized) return null;
    return projects.find((project) => project.name.trim().toLowerCase() === normalized) ?? null;
  }, [projectSearch, projects]);

  const topLevelTasks = useMemo(
    () => tasks.filter((task) => task.projectId === (selectedProject?.id ?? "") && !task.parentTaskId),
    [tasks, selectedProject],
  );
  const filteredTopLevelTasks = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();
    if (!query) return topLevelTasks;
    return topLevelTasks.filter((task) => task.name.toLowerCase().includes(query));
  }, [taskSearch, topLevelTasks]);

  const selectedTask = useMemo(() => {
    const normalized = taskSearch.trim().toLowerCase();
    if (!normalized) return null;
    return topLevelTasks.find((task) => task.name.trim().toLowerCase() === normalized) ?? null;
  }, [taskSearch, topLevelTasks]);

  const subtaskOptions = useMemo(
    () => tasks.filter((task) => task.parentTaskId === (selectedTask?.id ?? "")),
    [tasks, selectedTask],
  );
  const filteredSubtasks = useMemo(() => {
    const query = subtaskSearch.trim().toLowerCase();
    if (!query) return subtaskOptions;
    return subtaskOptions.filter((task) => task.name.toLowerCase().includes(query));
  }, [subtaskSearch, subtaskOptions]);
  const selectedSubtask = useMemo(() => {
    const normalized = subtaskSearch.trim().toLowerCase();
    if (!normalized) return null;
    return subtaskOptions.find((task) => task.name.trim().toLowerCase() === normalized) ?? null;
  }, [subtaskSearch, subtaskOptions]);

  const elapsedSeconds = startedAt ? Math.floor((timerNow.getTime() - startedAt.getTime()) / 1000) : 0;
  const totalTrackedSeconds = segments.reduce(
    (sum, segment) => sum + Math.floor((segment.end.getTime() - segment.start.getTime()) / 1000),
    0,
  );
  const combinedSeconds = totalTrackedSeconds + elapsedSeconds;
  const hasCrossedMidnight = startedAt ? !isSameLocalDate(startedAt, timerNow) : false;
  const effectiveEntryDate = startedAt ? toLocalDateValue(startedAt) : toLocalDateValue(timerNow);
  const isLockedToTask = startedAt !== null || segments.length > 0;

  function startTimer() {
    setStartedAt(new Date());
    setMessage(null);
  }

  function stopTimer() {
    if (!startedAt) return;
    const stoppedAt = new Date();
    if (stoppedAt.getTime() <= startedAt.getTime()) {
      return;
    }

    setSegments((current) => [...current, { start: startedAt, end: stoppedAt }]);
    setStartedAt(null);
  }

  async function saveEntries(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!selectedProject || !selectedTask || !summary.trim() || segments.length === 0) {
      setMessage("Select project/task, add summary, and capture at least one stopped segment.");
      return;
    }

    setIsSaving(true);
    try {
      for (const segment of segments) {
        const chunks = splitSegmentByDay(segment);
        for (const chunk of chunks) {
          const response = await fetch("/api/time-entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: selectedProject.id,
              taskId: selectedTask.id,
              subtaskId: selectedSubtask?.id ?? null,
              entryDate: chunk.entryDate,
              timeIn: chunk.start.toISOString(),
              timeOut: chunk.end.toISOString(),
              summary: summary.trim(),
            }),
          });

          if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(errorBody || "Failed to save one or more time segments.");
          }
        }
      }

      setSegments([]);
      setSummary("");
      setSubtaskSearch("");
      setMessage("Time entries saved.");
      window.location.href = "/timesheet";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save entries.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={saveEntries} className="grid gap-4 md:grid-cols-2">
      <label className="flex flex-col gap-2 text-sm">
        Project
        <input
          type="text"
          placeholder="Search projects..."
          className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
          value={projectSearch}
          onChange={(event) => {
            if (isLockedToTask) return;
            setProjectSearch(event.target.value);
            setTaskSearch("");
            setSubtaskSearch("");
          }}
          list="project-options"
          required
          disabled={isLockedToTask}
        />
        <datalist id="project-options">
          {filteredProjects.map((project) => (
            <option key={project.id} value={project.name} />
          ))}
        </datalist>
      </label>

      <label className="flex flex-col gap-2 text-sm">
        Task
        <input
          type="text"
          placeholder="Search tasks..."
          className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
          value={taskSearch}
          onChange={(event) => {
            if (isLockedToTask) return;
            setTaskSearch(event.target.value);
            setSubtaskSearch("");
          }}
          disabled={!selectedProject || isLockedToTask}
          list="task-options"
          required
        />
        <datalist id="task-options">
          {filteredTopLevelTasks.map((task) => (
            <option key={task.id} value={task.name} />
          ))}
        </datalist>
      </label>

      <label className="flex flex-col gap-2 text-sm">
        Subtask (optional)
        <input
          type="text"
          placeholder="Search subtasks..."
          className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
          value={subtaskSearch}
          onChange={(event) => setSubtaskSearch(event.target.value)}
          disabled={!selectedTask || startedAt !== null}
          list="subtask-options"
        />
        <datalist id="subtask-options">
          {filteredSubtasks.map((task) => (
            <option key={task.id} value={task.name} />
          ))}
        </datalist>
      </label>

      <div className="flex flex-col gap-2 text-sm">
        <span>Time Tracking ({effectiveEntryDate})</span>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant={startedAt ? "danger" : "primary"}
            onClick={startedAt ? stopTimer : startTimer}
            disabled={!selectedProject || !selectedTask}
          >
            {startedAt ? "Stop Timer" : "Start Timer"}
          </Button>
          <span className="font-mono text-base text-zinc-100">{formatElapsed(combinedSeconds)}</span>
        </div>
        {hasCrossedMidnight ? (
          <p className="text-xs text-amber-300">Timer crossed midnight. Save will split this segment across multiple days.</p>
        ) : null}
        <p className="text-xs text-zinc-500">Segments captured: {segments.length}</p>
      </div>

      <label className="col-span-full flex flex-col gap-2 text-sm">
        Summary
        <textarea
          name="summary"
          className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
          rows={3}
          required
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>

      <div className="col-span-full flex items-center justify-between">
        <span className="text-xs text-zinc-500">Use Start/Stop repeatedly to capture multiple segments for one task.</span>
        <Button
          type="submit"
          disabled={startedAt !== null || !selectedProject || !selectedTask || !summary.trim() || segments.length === 0 || isSaving}
        >
          {isSaving ? "Saving..." : "Save Entry"}
        </Button>
      </div>
      {message ? <p className="col-span-full text-sm text-zinc-300">{message}</p> : null}
    </form>
  );
}
