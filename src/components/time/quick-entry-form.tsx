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
  assignedUserId?: string | null;
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

const TIMER_DRAFT_STORAGE_KEY = "quick-entry-timer-draft:v1";

type StoredQuickEntryDraft = {
  projectSearch: string;
  taskSearch: string;
  subtaskSearch: string;
  summary: string;
  startedAt: string | null;
  segments: Array<{ start: string; end: string }>;
  manualTimeIn: string;
  manualTimeOut: string;
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
  const [manualTimeIn, setManualTimeIn] = useState("");
  const [manualTimeOut, setManualTimeOut] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const raw = window.localStorage.getItem(TIMER_DRAFT_STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<StoredQuickEntryDraft>;
      if (typeof parsed.projectSearch === "string") setProjectSearch(parsed.projectSearch);
      if (typeof parsed.taskSearch === "string") setTaskSearch(parsed.taskSearch);
      if (typeof parsed.subtaskSearch === "string") setSubtaskSearch(parsed.subtaskSearch);
      if (typeof parsed.summary === "string") setSummary(parsed.summary);
      if (typeof parsed.manualTimeIn === "string") setManualTimeIn(parsed.manualTimeIn);
      if (typeof parsed.manualTimeOut === "string") setManualTimeOut(parsed.manualTimeOut);
      if (parsed.startedAt) {
        const restoredStart = new Date(parsed.startedAt);
        if (!Number.isNaN(restoredStart.getTime())) {
          setStartedAt(restoredStart);
        }
      }
      if (Array.isArray(parsed.segments)) {
        const restoredSegments = parsed.segments
          .map((segment) => ({
            start: new Date(segment.start),
            end: new Date(segment.end),
          }))
          .filter((segment) => !Number.isNaN(segment.start.getTime()) && !Number.isNaN(segment.end.getTime()));
        setSegments(restoredSegments);
      }
    } catch {
      window.localStorage.removeItem(TIMER_DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!startedAt) {
      return;
    }

    const interval = window.setInterval(() => setTimerNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    const draft: StoredQuickEntryDraft = {
      projectSearch,
      taskSearch,
      subtaskSearch,
      summary,
      startedAt: startedAt ? startedAt.toISOString() : null,
      segments: segments.map((segment) => ({
        start: segment.start.toISOString(),
        end: segment.end.toISOString(),
      })),
      manualTimeIn,
      manualTimeOut,
    };
    window.localStorage.setItem(TIMER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [manualTimeIn, manualTimeOut, projectSearch, segments, startedAt, subtaskSearch, summary, taskSearch]);

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

  const projectTasks = useMemo(
    () => tasks.filter((task) => task.projectId === (selectedProject?.id ?? "")),
    [tasks, selectedProject],
  );
  const topLevelTasks = useMemo(
    () => projectTasks.filter((task) => !task.parentTaskId),
    [projectTasks],
  );
  const assignedSubtasksByParent = useMemo(() => {
    const map = new Map<string, TaskOption[]>();
    for (const task of projectTasks) {
      if (!task.parentTaskId || !task.assignedUserId) continue;
      const current = map.get(task.parentTaskId) ?? [];
      current.push(task);
      map.set(task.parentTaskId, current);
    }
    return map;
  }, [projectTasks]);
  const visibleTopLevelTasks = useMemo(
    () =>
      topLevelTasks.filter(
        (task) => Boolean(task.assignedUserId) || (assignedSubtasksByParent.get(task.id)?.length ?? 0) > 0,
      ),
    [topLevelTasks, assignedSubtasksByParent],
  );
  const filteredTopLevelTasks = useMemo(() => {
    const query = taskSearch.trim().toLowerCase();
    if (!query) return visibleTopLevelTasks;
    return visibleTopLevelTasks.filter((task) => task.name.toLowerCase().includes(query));
  }, [taskSearch, visibleTopLevelTasks]);

  const selectedTask = useMemo(() => {
    const normalized = taskSearch.trim().toLowerCase();
    if (!normalized) return null;
    return visibleTopLevelTasks.find((task) => task.name.trim().toLowerCase() === normalized) ?? null;
  }, [taskSearch, visibleTopLevelTasks]);

  const subtaskOptions = useMemo(
    () => (selectedTask ? (assignedSubtasksByParent.get(selectedTask.id) ?? []) : []),
    [selectedTask, assignedSubtasksByParent],
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
  const manualRangeActive = Boolean(manualTimeIn && manualTimeOut);
  const isLockedToTask = startedAt !== null || segments.length > 0 || manualRangeActive;

  function startTimer() {
    setManualTimeIn("");
    setManualTimeOut("");
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
    if (!selectedProject || !selectedTask || !summary.trim()) {
      setMessage("Select project/task and enter a summary.");
      return;
    }

    const segmentSources: Segment[] =
      segments.length > 0
        ? segments
        : manualTimeIn && manualTimeOut
          ? [{ start: new Date(manualTimeIn), end: new Date(manualTimeOut) }]
          : [];

    if (segmentSources.length === 0) {
      setMessage("Use Start/Stop timer segments, or enter Time in and Time out.");
      return;
    }

    const last = segmentSources[segmentSources.length - 1]!;
    if (last.end.getTime() <= last.start.getTime()) {
      setMessage("Time out must be after time in.");
      return;
    }

    setIsSaving(true);
    try {
      for (const segment of segmentSources) {
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
      setManualTimeIn("");
      setManualTimeOut("");
      setSummary("");
      setSubtaskSearch("");
      setMessage("Time entries saved.");
      window.localStorage.removeItem(TIMER_DRAFT_STORAGE_KEY);
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

      <div className="flex flex-col gap-2 text-sm md:col-span-2">
        <span className="font-medium text-zinc-200">Time in / Time out (required)</span>
        <p className="text-xs text-zinc-500">
          Either use the timer below for one or more segments, or enter explicit times (splits across midnight automatically).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Time in</span>
            <input
              type="datetime-local"
              className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
              value={manualTimeIn}
              onChange={(event) => setManualTimeIn(event.target.value)}
              disabled={!selectedProject || !selectedTask || segments.length > 0 || startedAt !== null}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">Time out</span>
            <input
              type="datetime-local"
              className="rounded-md border border-zinc-700 bg-zinc-950 p-2"
              value={manualTimeOut}
              onChange={(event) => setManualTimeOut(event.target.value)}
              disabled={!selectedProject || !selectedTask || segments.length > 0 || startedAt !== null}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm md:col-span-2">
        <span>Timer ({effectiveEntryDate})</span>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant={startedAt ? "danger" : "primary"}
            onClick={startedAt ? stopTimer : startTimer}
            disabled={!selectedProject || !selectedTask || manualRangeActive}
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
        <span className="text-xs text-zinc-500">
          Timer: Start/Stop for multiple segments. Or fill Time in / Time out for a single range. Summary is always required.
        </span>
        <Button
          type="submit"
          disabled={
            startedAt !== null ||
            !selectedProject ||
            !selectedTask ||
            !summary.trim() ||
            isSaving ||
            (segments.length === 0 && !(manualTimeIn && manualTimeOut))
          }
        >
          {isSaving ? "Saving..." : "Save Entry"}
        </Button>
      </div>
      {message ? <p className="col-span-full text-sm text-zinc-300">{message}</p> : null}
    </form>
  );
}
