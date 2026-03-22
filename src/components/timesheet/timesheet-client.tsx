"use client";

import { Fragment, useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import { Button } from "@/components/ui/button";

type Entry = {
  id: string;
  entryDate: string | Date;
  projectId: string;
  timeIn: string | Date;
  timeOut: string | Date;
  summary: string;
  durationMinutes: number;
  status: "draft" | "submitted" | "approved" | "rejected";
};

type ProjectOption = {
  id: string;
  name: string;
};

type Props = {
  entries: Entry[];
  weekDates: Date[];
  projectOptions: ProjectOption[];
  timezone: string;
};

export function TimesheetClient({ entries, weekDates, projectOptions, timezone }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftSummary, setDraftSummary] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [projectSearch, setProjectSearch] = useState<string>("");

  function getEntrySeconds(entry: Entry) {
    const start = new Date(entry.timeIn).getTime();
    const end = new Date(entry.timeOut).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return Math.max(0, entry.durationMinutes * 60);
    }
    return Math.floor((end - start) / 1000);
  }

  const entryProjectIds = useMemo(() => new Set(entries.map((entry) => entry.projectId)), [entries]);
  const availableProjectOptions = useMemo(
    () => projectOptions.filter((project) => entryProjectIds.has(project.id)),
    [projectOptions, entryProjectIds],
  );
  const selectedProjectOption = useMemo(() => {
    const normalized = projectSearch.trim().toLowerCase();
    if (!normalized) return null;
    return availableProjectOptions.find((project) => project.name.trim().toLowerCase() === normalized) ?? null;
  }, [projectSearch, availableProjectOptions]);

  const filteredEntries = useMemo(() => {
    if (!selectedProjectOption) return entries;
    return entries.filter((entry) => entry.projectId === selectedProjectOption.id);
  }, [entries, selectedProjectOption]);

  const dailyTotals = useMemo(
    () =>
      weekDates.map((date) => {
        const total = filteredEntries
          .filter((entry) => isSameDay(new Date(entry.entryDate), date))
          .reduce((sum, entry) => sum + getEntrySeconds(entry), 0);
        return { date, total };
      }),
    [filteredEntries, weekDates],
  );
  const groupedEntries = useMemo(
    () =>
      weekDates
        .map((date) => {
          const dayEntries = filteredEntries
            .filter((entry) => isSameDay(new Date(entry.entryDate), date))
            .sort((left, right) => new Date(left.timeIn).getTime() - new Date(right.timeIn).getTime());
          const daySeconds = dayEntries.reduce((sum, entry) => sum + getEntrySeconds(entry), 0);
          return { date, dayEntries, daySeconds };
        })
        .filter((group) => group.dayEntries.length > 0),
    [filteredEntries, weekDates],
  );

  const maxDailyTotal = Math.max(...dailyTotals.map((d) => d.total), 1);

  const totalSeconds = filteredEntries.reduce((sum, entry) => sum + getEntrySeconds(entry), 0);

  function formatUsDate(value: string | Date) {
    return new Date(value).toLocaleDateString("en-US", {
      weekday: "short",
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      timeZone: timezone,
    });
  }

  function formatUsTime(value: string | Date) {
    return new Date(value).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: timezone,
    });
  }

  function formatHms(totalSecondsValue: number) {
    const safe = Math.max(0, Math.round(totalSecondsValue));
    const hours = String(Math.floor(safe / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
    const seconds = String(safe % 60).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  async function saveSummary(entryId: string) {
    setPendingId(entryId);
    try {
      const response = await fetch(`/api/time-entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: draftSummary }),
      });
      if (response.ok) {
        window.location.reload();
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-right text-xs text-zinc-500">All times shown in {timezone}</p>
      <div className="flex items-center justify-end">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          Project
          <input
            type="text"
            className="rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm"
            placeholder="Search project..."
            list="timesheet-project-options"
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
          />
          <datalist id="timesheet-project-options">
            {availableProjectOptions.map((project) => (
              <option key={project.id} value={project.name} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {dailyTotals.map(({ date, total }) => (
          <div key={date.toISOString()} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2">
            <p className="text-xs text-zinc-500">{format(date, "EEE")}</p>
            <p className="mt-1 text-sm font-medium">{formatHms(total)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded bg-zinc-800">
              <div className="h-full bg-indigo-500" style={{ width: `${Math.round((total / maxDailyTotal) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <table className="w-full text-sm">
        <thead className="bg-zinc-900/80 text-left text-zinc-400">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Time In</th>
            <th className="px-4 py-3">Time Out</th>
            <th className="px-4 py-3">Summary</th>
            <th className="px-4 py-3">Hours</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {groupedEntries.map(({ date, dayEntries, daySeconds }) => (
            <Fragment key={date.toISOString()}>
              <tr className="border-t border-zinc-700 bg-zinc-900/40">
                <td className="px-4 py-3 font-medium text-zinc-100" colSpan={4}>
                  {formatUsDate(date)}
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-zinc-100">{formatHms(daySeconds)}</td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
              {dayEntries.map((entry) => {
                const isDraft = entry.status === "draft";
                const isEditing = editingId === entry.id;
                return (
                  <tr key={entry.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3 text-zinc-500">-</td>
                    <td className="px-4 py-3">{formatUsTime(entry.timeIn)}</td>
                    <td className="px-4 py-3">{formatUsTime(entry.timeOut)}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <input
                          className="w-full rounded-md border border-zinc-700 bg-zinc-950 p-2"
                          value={draftSummary}
                          onChange={(event) => setDraftSummary(event.target.value)}
                        />
                      ) : (
                        entry.summary
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">{formatHms(getEntrySeconds(entry))}</td>
                    <td className="px-4 py-3 capitalize">{entry.status}</td>
                    <td className="px-4 py-3 text-right">
                      {!isDraft ? (
                        <span className="text-xs text-zinc-500">Locked</span>
                      ) : isEditing ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setEditingId(null);
                              setDraftSummary("");
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" onClick={() => saveSummary(entry.id)} disabled={pendingId === entry.id}>
                            Save
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setEditingId(entry.id);
                            setDraftSummary(entry.summary);
                          }}
                        >
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
          <tr className="border-t border-zinc-700 bg-zinc-900/40">
            <td className="px-4 py-3 font-medium text-zinc-200" colSpan={4}>
              Weekly Total
            </td>
            <td className="px-4 py-3 font-mono font-semibold text-zinc-100">{formatHms(totalSeconds)}</td>
            <td className="px-4 py-3" colSpan={2} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
