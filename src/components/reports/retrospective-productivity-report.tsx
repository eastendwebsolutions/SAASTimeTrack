"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type FiltersPayload = {
  companies: Array<{ id: string; name: string }>;
  integrationTypes: string[];
  workspaces: Array<{
    externalIntegrationType: string;
    workspace: { externalWorkspaceId: string; workspaceName: string };
  }>;
  sprints: Array<{ externalSprintId: string; sprintName: string; startDate: string; endDate: string }>;
  users: Array<{ id: string; email: string }>;
  statuses: string[];
  role: "user" | "company_admin" | "super_admin";
  canManageMappings: boolean;
  projects: Array<{ id: string; name: string }>;
  taskStatuses: string[];
};

type SummaryPayload = {
  totalEstimatedHours: number;
  totalActualHours: number;
  hourVariance: number;
  totalStoryPoints: number | null;
  totalActualPoints: number | null;
  pointVariance: number | null;
  tasksWorked: number;
  completedTasks: number;
  avgActualHoursPerStoryPoint: number | null;
  usersIncluded: number;
};

type TrendRow = {
  periodKey: string;
  label: string;
  estimatedHours: number;
  actualHours: number;
  storyPoints: number;
  actualPoints: number;
  isSelected: boolean;
};

type TableRow = {
  teamMember: string;
  integration: string;
  workspace: string;
  period: string;
  tasks: Array<{
    project: string;
    task: string;
    subtask: string | null;
    estimatedHours: number | null;
    actualLoggedHours: number;
    storyPoints: number | null;
    actualPoints: number | null;
    varianceHours: number | null;
    variancePct: number | null;
    taskStatus: string | null;
    completionDate: string | null;
    timeEntryCount: number;
    lastTimeEntryDate: string | null;
    taskId: string | null;
  }>;
};

type DrillEntry = {
  id: string;
  date: string;
  timeIn: string;
  timeOut: string;
  durationMinutes: number;
  summary: string;
  approvalStatus: string;
  timesheetWeek: string | null;
  approvedRejectedStatus: string | null;
  adminComments: string | null;
};

function formatNumber(value: number | null, digits = 1) {
  if (value === null || value === undefined) return "N/A";
  return value.toFixed(digits);
}

export function RetrospectiveProductivityReport() {
  const [filtersData, setFiltersData] = useState<FiltersPayload | null>(null);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedIntegration, setSelectedIntegration] = useState("asana");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [periodMode, setPeriodMode] = useState<"sprint" | "date_range">("date_range");
  const [selectedSprintId, setSelectedSprintId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([]);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [table, setTable] = useState<TableRow[]>([]);
  const [metricMode, setMetricMode] = useState<"hours" | "points">("hours");
  const [drillTaskId, setDrillTaskId] = useState<string | null>(null);
  const [drillEntries, setDrillEntries] = useState<DrillEntry[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [mappingFields, setMappingFields] = useState<Record<string, string>>({});
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedTaskStatus, setSelectedTaskStatus] = useState("");

  const filtersQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("integrationType", selectedIntegration);
    if (selectedWorkspaceId) params.set("workspaceId", selectedWorkspaceId);
    if (selectedCompanyId) params.set("companyId", selectedCompanyId);
    return params.toString();
  }, [selectedIntegration, selectedWorkspaceId, selectedCompanyId]);

  useEffect(() => {
    let mounted = true;
    async function loadFilters() {
      setLoadingFilters(true);
      const response = await fetch(`/api/reports/retrospective/filters?${filtersQuery}`, { cache: "no-store" });
      const payload: FiltersPayload = await response.json();
      if (!mounted) return;
      setFiltersData(payload);
      if (!selectedCompanyId && payload.companies[0]) setSelectedCompanyId(payload.companies[0].id);
      if (!selectedWorkspaceId && payload.workspaces[0]) {
        setSelectedWorkspaceId(payload.workspaces[0].workspace.externalWorkspaceId);
      }
      if (!selectedTeamMembers.length && payload.users.length) {
        setSelectedTeamMembers(payload.users.map((u) => u.id));
      }
      setLoadingFilters(false);
    }
    loadFilters();
    return () => {
      mounted = false;
    };
  }, [filtersQuery, selectedCompanyId, selectedTeamMembers.length, selectedWorkspaceId]);

  useEffect(() => {
    async function loadMappings() {
      const response = await fetch(`/api/reports/field-mappings?integrationType=${selectedIntegration}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      const map: Record<string, string> = {};
      for (const row of payload.mappings ?? []) {
        map[row.mappingKey] = row.externalFieldName ?? "";
      }
      setMappingFields(map);
    }
    loadMappings();
  }, [selectedIntegration]);

  const reportQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("integrationType", selectedIntegration);
    params.set("workspaceId", selectedWorkspaceId);
    params.set("periodMode", periodMode);
    if (selectedCompanyId) params.set("companyId", selectedCompanyId);
    if (periodMode === "sprint") {
      params.set("sprintId", selectedSprintId);
    } else {
      params.set("startDate", startDate);
      params.set("endDate", endDate);
    }
    if (selectedProjectId) params.set("projectId", selectedProjectId);
    if (selectedTaskStatus) params.set("taskStatus", selectedTaskStatus);
    if (selectedTeamMembers.length && filtersData?.users.length && selectedTeamMembers.length !== filtersData.users.length) {
      params.set("teamMemberIds", selectedTeamMembers.join(","));
    } else {
      params.set("teamMemberIds", "all");
    }
    return params.toString();
  }, [selectedIntegration, selectedWorkspaceId, periodMode, selectedCompanyId, selectedSprintId, startDate, endDate, selectedTeamMembers, filtersData, selectedProjectId, selectedTaskStatus]);

  async function runReport() {
    setLoadingReport(true);
    const [summaryRes, trendsRes, tableRes] = await Promise.all([
      fetch(`/api/reports/retrospective/summary?${reportQuery}`, { cache: "no-store" }),
      fetch(`/api/reports/retrospective/trends?${reportQuery}`, { cache: "no-store" }),
      fetch(`/api/reports/retrospective/table?${reportQuery}`, { cache: "no-store" }),
    ]);
    setSummary(await summaryRes.json());
    setTrends(await trendsRes.json());
    setTable(await tableRes.json());
    setLoadingReport(false);
  }

  useEffect(() => {
    if (!selectedWorkspaceId) return;
    if (periodMode === "sprint" && !selectedSprintId) return;
    if (periodMode === "date_range" && (!startDate || !endDate)) return;
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportQuery]);

  async function openDrilldown(taskId: string) {
    setDrillTaskId(taskId);
    setDrillLoading(true);
    const response = await fetch(`/api/reports/retrospective/task/${taskId}/time-entries?${reportQuery}`, { cache: "no-store" });
    setDrillEntries(await response.json());
    setDrillLoading(false);
  }

  async function saveMappings() {
    if (!filtersData.canManageMappings) return;
    const payload = {
      integrationType: selectedIntegration,
      mappings: Object.entries(mappingFields).map(([mappingKey, externalFieldName]) => ({
        mappingKey,
        externalFieldName: externalFieldName || null,
        externalFieldId: null,
        externalFieldType: null,
      })),
    };
    await fetch("/api/reports/field-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  if (loadingFilters || !filtersData) {
    return <div className="animate-pulse text-sm text-zinc-400">Loading report configuration...</div>;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-100">Retrospective Productivity Report</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Compare planned sprint effort with actual timesheet execution. Supports integration-normalized metrics so more providers can be enabled without reworking report logic.
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`/api/reports/retrospective/export/user-summary-csv?${reportQuery}`}>
            <Button variant="secondary">Export User Summary CSV</Button>
          </a>
          <a href={`/api/reports/retrospective/export/detail-csv?${reportQuery}`}>
            <Button variant="secondary">Export Detail CSV</Button>
          </a>
        </div>
      </div>

      <Card className="grid gap-3 p-4 md:grid-cols-4">
        {filtersData.companies.length > 1 ? (
          <label className="text-sm">
            <span className="mb-1 block text-zinc-400">Company</span>
            <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2" value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}>
              {filtersData.companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm">
          <span className="mb-1 block text-zinc-400">Integration</span>
          <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2" value={selectedIntegration} onChange={(e) => setSelectedIntegration(e.target.value)}>
            {filtersData.integrationTypes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-400">Workspace</span>
          <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2" value={selectedWorkspaceId} onChange={(e) => setSelectedWorkspaceId(e.target.value)}>
            {filtersData.workspaces.map((item) => (
              <option key={item.workspace.externalWorkspaceId} value={item.workspace.externalWorkspaceId}>
                {item.workspace.workspaceName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-400">Period Mode</span>
          <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2" value={periodMode} onChange={(e) => setPeriodMode(e.target.value as "sprint" | "date_range")}>
            <option value="sprint">Sprint</option>
            <option value="date_range">Date range</option>
          </select>
        </label>

        {periodMode === "sprint" ? (
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-zinc-400">Sprint</span>
            <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2" value={selectedSprintId} onChange={(e) => setSelectedSprintId(e.target.value)}>
              <option value="">Select sprint</option>
              {filtersData.sprints.map((item) => <option key={item.externalSprintId} value={item.externalSprintId}>{item.sprintName}</option>)}
            </select>
          </label>
        ) : (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-zinc-400">Start date</span>
              <input type="date" className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-zinc-400">End date</span>
              <input type="date" className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </>
        )}

        <label className="text-sm md:col-span-2">
          <span className="mb-1 block text-zinc-400">Team members</span>
          <select
            multiple
            className="h-24 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2"
            value={selectedTeamMembers}
            onChange={(e) => {
              const values = Array.from(e.target.selectedOptions).map((option) => option.value);
              setSelectedTeamMembers(values);
            }}
          >
            {filtersData.users.map((member) => (
              <option key={member.id} value={member.id}>
                {member.email}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-400">Project (optional)</span>
          <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2" value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            <option value="">All projects</option>
            {filtersData.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-zinc-400">Task status (optional)</span>
          <select className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2" value={selectedTaskStatus} onChange={(e) => setSelectedTaskStatus(e.target.value)}>
            <option value="">All statuses</option>
            {filtersData.taskStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </label>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-200">Five-period trend</h2>
          <div className="flex gap-2">
            <Button variant={metricMode === "hours" ? "primary" : "secondary"} onClick={() => setMetricMode("hours")}>Hours</Button>
            <Button variant={metricMode === "points" ? "primary" : "secondary"} onClick={() => setMetricMode("points")}>Points</Button>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
              <XAxis dataKey="label" stroke="#a1a1aa" />
              <YAxis stroke="#a1a1aa" />
              <Tooltip />
              <Legend />
              {metricMode === "hours" ? (
                <>
                  <Bar dataKey="estimatedHours" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualHours" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </>
              ) : (
                <>
                  <Bar dataKey="storyPoints" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualPoints" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {summary ? (
        <div className="grid gap-3 md:grid-cols-5">
          <Card className="p-4"><p className="text-xs text-zinc-400">Estimated Hours</p><p className="mt-1 text-xl">{formatNumber(summary.totalEstimatedHours)}</p></Card>
          <Card className="p-4"><p className="text-xs text-zinc-400">Actual Hours</p><p className="mt-1 text-xl">{formatNumber(summary.totalActualHours)}</p></Card>
          <Card className="p-4"><p className="text-xs text-zinc-400">Hour Variance</p><p className="mt-1 text-xl">{formatNumber(summary.hourVariance)}</p></Card>
          <Card className="p-4"><p className="text-xs text-zinc-400">Points (Plan/Actual)</p><p className="mt-1 text-xl">{formatNumber(summary.totalStoryPoints)} / {formatNumber(summary.totalActualPoints)}</p></Card>
          <Card className="p-4"><p className="text-xs text-zinc-400">Tasks Worked / Completed</p><p className="mt-1 text-xl">{summary.tasksWorked} / {summary.completedTasks}</p></Card>
        </div>
      ) : null}

      <Card className="overflow-x-auto p-4">
        <h2 className="mb-3 text-sm font-medium text-zinc-200">Task detail by team member</h2>
        {loadingReport ? (
          <div className="animate-pulse text-sm text-zinc-400">Loading report rows...</div>
        ) : table.length === 0 ? (
          <div className="text-sm text-zinc-400">No report rows match this filter combination.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400">
                <th className="py-2">Team member</th>
                <th className="py-2">Integration</th>
                <th className="py-2">Workspace</th>
                <th className="py-2">Project</th>
                <th className="py-2">Task</th>
                <th className="py-2">Estimated</th>
                <th className="py-2">Actual</th>
                <th className="py-2">Story pts</th>
                <th className="py-2">Actual pts</th>
                <th className="py-2">Variance</th>
                <th className="py-2">Status</th>
                <th className="py-2">Entries</th>
              </tr>
            </thead>
            <tbody>
              {table.flatMap((member) => member.tasks.map((task) => (
                <tr key={`${member.teamMember}-${task.task}-${task.timeEntryCount}`} className="border-t border-zinc-800">
                  <td className="py-2">{member.teamMember}</td>
                  <td className="py-2">{member.integration}</td>
                  <td className="py-2">{member.workspace}</td>
                  <td className="py-2">{task.project}</td>
                  <td className="py-2">
                    <button className="text-left text-indigo-300 hover:underline" onClick={() => task.taskId && openDrilldown(task.taskId)}>
                      {task.task}
                    </button>
                  </td>
                  <td className="py-2">{formatNumber(task.estimatedHours)}</td>
                  <td className="py-2">{formatNumber(task.actualLoggedHours)}</td>
                  <td className="py-2">{formatNumber(task.storyPoints)}</td>
                  <td className="py-2">{formatNumber(task.actualPoints)}</td>
                  <td className="py-2">{formatNumber(task.varianceHours)}</td>
                  <td className="py-2">{task.taskStatus ?? "N/A"}</td>
                  <td className="py-2">{task.timeEntryCount}</td>
                </tr>
              )))}
            </tbody>
          </table>
        )}
      </Card>

      {drillTaskId ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-200">Time entries for task {drillTaskId}</h3>
            <Button variant="secondary" onClick={() => setDrillTaskId(null)}>Close</Button>
          </div>
          {drillLoading ? (
            <div className="text-sm text-zinc-400">Loading time entry drilldown...</div>
          ) : drillEntries.length === 0 ? (
            <div className="text-sm text-zinc-400">No time entries found for this task.</div>
          ) : (
            <div className="space-y-2">
              {drillEntries.map((entry) => (
                <div key={entry.id} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3 text-sm">
                  <p className="text-zinc-300">{new Date(entry.date).toLocaleDateString()} • {entry.durationMinutes} min • {entry.approvalStatus}</p>
                  <p className="mt-1 text-zinc-400">{entry.summary}</p>
                  <p className="mt-1 text-xs text-zinc-500">Week: {entry.timesheetWeek ? new Date(entry.timesheetWeek).toLocaleDateString() : "N/A"} • Decision: {entry.approvedRejectedStatus ?? "N/A"}</p>
                  {entry.adminComments ? <p className="mt-1 text-xs text-amber-300">Admin comments: {entry.adminComments}</p> : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-zinc-200">Asana field mapping configuration</h2>
          {filtersData.canManageMappings ? <Button variant="secondary" onClick={saveMappings}>Save mappings</Button> : null}
        </div>
        <p className="mt-2 text-xs text-zinc-500">If these are empty, planning metrics may show as N/A while actual hour metrics still work.</p>
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          {["estimate_hours", "story_points", "actual_points", "sprint", "task_status"].map((key) => (
            <div key={key} className="rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2">
              <label className="text-zinc-500">{key}</label>
              <input
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200"
                value={mappingFields[key] ?? ""}
                disabled={!filtersData.canManageMappings}
                onChange={(e) => setMappingFields((prev) => ({ ...prev, [key]: e.target.value }))}
                placeholder="Asana custom field name"
              />
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
