"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeveloperEffectivenessUserDetailDrawer } from "@/components/reports/developer-effectiveness/user-detail-drawer";

type FiltersPayload = {
  companies: { id: string; name: string }[];
  integrationTypes: string[];
  workspaces: {
    id: string;
    companyId: string;
    integrationType: string;
    externalWorkspaceId: string;
    workspaceName: string;
  }[];
  users: { id: string; email: string }[];
  statuses: string[];
  role: string;
  weightProfiles: { id: string; name: string; isDefault: boolean; companyId: string | null }[];
  datePresets: readonly string[];
  tooltips?: { deliveryScore?: string; aiAdoptionScore?: string };
};

function buildQueryString(state: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(state)) {
    if (v !== undefined && v !== "") p.set(k, v);
  }
  return p.toString();
}

export function DeveloperEffectivenessClient() {
  const [companyId, setCompanyId] = useState<string>("");
  const [integrationType, setIntegrationType] = useState("asana");
  const [workspaceId, setWorkspaceId] = useState("");
  const [periodMode, setPeriodMode] = useState<"date_range" | "sprint">("date_range");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sprintId, setSprintId] = useState("");
  const teamMemberIds = "all";
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const filtersQuery = useQuery({
    queryKey: ["de-filters", companyId],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (companyId) p.set("companyId", companyId);
      const res = await fetch(`/api/reports/developer-effectiveness/filters?${p.toString()}`);
      if (!res.ok) throw new Error("Failed to load filters");
      return (await res.json()) as FiltersPayload;
    },
  });

  const filterResponse = filtersQuery.data;
  const effectiveCompanyId = useMemo(
    () => companyId || filterResponse?.companies[0]?.id || "",
    [companyId, filterResponse?.companies],
  );

  const workspacesForIntegration = useMemo(
    () => (filterResponse?.workspaces ?? []).filter((w) => w.integrationType === integrationType),
    [filterResponse?.workspaces, integrationType],
  );

  const effectiveWorkspaceId = useMemo(
    () => workspaceId || workspacesForIntegration[0]?.externalWorkspaceId || "",
    [workspaceId, workspacesForIntegration],
  );

  const filtersKey = useMemo(
    () =>
      buildQueryString({
        companyId: effectiveCompanyId || undefined,
        integrationType,
        workspaceId: effectiveWorkspaceId,
        periodMode,
        sprintId: periodMode === "sprint" ? sprintId : undefined,
        startDate: periodMode === "date_range" ? startDate : undefined,
        endDate: periodMode === "date_range" ? endDate : undefined,
        teamMemberIds,
      }),
    [
      effectiveCompanyId,
      effectiveWorkspaceId,
      integrationType,
      periodMode,
      sprintId,
      startDate,
      endDate,
      teamMemberIds,
    ],
  );

  const summaryQuery = useQuery({
    queryKey: ["de-summary", filtersKey],
    enabled: Boolean(effectiveWorkspaceId),
    queryFn: async () => {
      const res = await fetch(`/api/reports/developer-effectiveness/summary?${filtersKey}`);
      if (!res.ok) throw new Error("Failed to load summary");
      return res.json();
    },
  });

  const quadrantQuery = useQuery({
    queryKey: ["de-quadrant", filtersKey],
    enabled: Boolean(effectiveWorkspaceId),
    queryFn: async () => {
      const res = await fetch(`/api/reports/developer-effectiveness/quadrant?${filtersKey}`);
      if (!res.ok) throw new Error("Failed to load quadrant");
      return (await res.json()) as {
        points: { userId: string; displayName: string; x: number; y: number; bandLabel: string }[];
      };
    },
  });

  const trendsQuery = useQuery({
    queryKey: ["de-trends", filtersKey],
    enabled: Boolean(effectiveWorkspaceId),
    queryFn: async () => {
      const res = await fetch(`/api/reports/developer-effectiveness/trends?${filtersKey}&overlay=team`);
      if (!res.ok) throw new Error("Failed to load trends");
      return (await res.json()) as {
        series: { key: string; label: string; points: { date: string; value: number }[] }[];
      };
    },
  });

  const tableQuery = useQuery({
    queryKey: ["de-table", filtersKey],
    enabled: Boolean(effectiveWorkspaceId),
    queryFn: async () => {
      const res = await fetch(`/api/reports/developer-effectiveness/table?${filtersKey}`);
      if (!res.ok) throw new Error("Failed to load table");
      return (await res.json()) as {
        rows: {
          userId: string;
          displayName: string;
          deliveryScore: number;
          aiAdoptionScore: number;
          tasksCompleted: number;
          storyPointsCompleted: number;
          band: { label: string };
        }[];
      };
    },
  });

  const userDetailQuery = useQuery({
    queryKey: ["de-user", selectedUserId, filtersKey],
    enabled: Boolean(selectedUserId && effectiveWorkspaceId),
    queryFn: async () => {
      const res = await fetch(
        `/api/reports/developer-effectiveness/user/${selectedUserId}?${filtersKey}`,
      );
      if (!res.ok) throw new Error("Failed to load user");
      return res.json();
    },
  });

  const runRollup = useCallback(async () => {
    const p = effectiveCompanyId ? `?companyId=${effectiveCompanyId}` : "";
    await fetch(`/api/reports/developer-effectiveness/rollup${p}`, { method: "POST", body: JSON.stringify({}) });
    await summaryQuery.refetch();
  }, [effectiveCompanyId, summaryQuery]);

  const data = filtersQuery.data;
  const workspaces = workspacesForIntegration;

  return (
    <div className="space-y-8 pb-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">AI Developer Effectiveness</h1>
        <p className="max-w-3xl text-sm text-zinc-400">
          Engineering intelligence: AI adoption vs delivery effectiveness. Operational metrics only—no chat
          surveillance. Data quality improves as Cursor and PM rollups run.
        </p>
      </header>

      <Card className="space-y-4 border-zinc-800 bg-zinc-950/60 p-5">
        <div className="flex flex-wrap items-end gap-3">
          {data && data.companies.length > 1 ? (
            <label className="flex flex-col text-xs text-zinc-400">
              Company
              <select
                className="mt-1 min-w-44 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                value={companyId || data.companies[0]?.id || ""}
                onChange={(e) => setCompanyId(e.target.value)}
              >
                {data.companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col text-xs text-zinc-400">
            PM integration
            <select
              className="mt-1 min-w-36 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              value={integrationType}
              onChange={(e) => {
                setIntegrationType(e.target.value);
                setWorkspaceId("");
              }}
            >
              {data?.integrationTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-zinc-400">
            Workspace
            <select
              className="mt-1 min-w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              value={workspaceId || workspaces[0]?.externalWorkspaceId || ""}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.externalWorkspaceId}>
                  {w.workspaceName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-zinc-400">
            Period
            <select
              className="mt-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value as "date_range" | "sprint")}
            >
              <option value="date_range">Date range</option>
              <option value="sprint">Sprint</option>
            </select>
          </label>
          {periodMode === "date_range" ? (
            <>
              <label className="flex flex-col text-xs text-zinc-400">
                Start
                <input
                  type="date"
                  className="mt-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col text-xs text-zinc-400">
                End
                <input
                  type="date"
                  className="mt-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label className="flex flex-col text-xs text-zinc-400">
              Sprint id
              <input
                className="mt-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                placeholder="external sprint id"
              />
            </label>
          )}
          <Button type="button" variant="secondary" className="ml-auto border-zinc-600" onClick={() => runRollup()}>
            Refresh rollups
          </Button>
        </div>
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {(summaryQuery.data?.cards ?? []).map(
          (c: { key: string; label: string; value: number | string | null; tooltip?: string; prev?: number | null }) => (
            <Card
              key={c.key}
              className="border-zinc-800 bg-gradient-to-b from-zinc-900/80 to-zinc-950/90 p-4 transition hover:border-indigo-500/40"
              title={c.tooltip}
            >
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{c.label}</p>
              <p className="mt-2 text-2xl font-semibold text-zinc-50">{c.value ?? "—"}</p>
              {c.prev != null && typeof c.value === "number" && typeof c.prev === "number" ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Prior: {Math.round(c.prev * 10) / 10}{" "}
                  <span className={c.value >= c.prev ? "text-emerald-400" : "text-amber-400"}>
                    {c.value >= c.prev ? "▲" : "▼"}
                  </span>
                </p>
              ) : null}
            </Card>
          ),
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-950/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-medium text-zinc-100">Effectiveness quadrant</h2>
            <span className="text-xs text-zinc-500">X: AI adoption · Y: Delivery</span>
          </div>
          <div className="relative h-[360px] w-full">
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-zinc-600">
              <div className="grid h-full w-full grid-cols-2 grid-rows-2 opacity-40">
                <span className="flex items-end justify-end p-2">Traditional strength</span>
                <span className="flex items-end justify-start p-2">AI power users</span>
                <span className="flex items-start justify-end p-2">Needs coaching</span>
                <span className="flex items-start justify-start p-2">Heavy AI users</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis type="number" dataKey="x" name="AI adoption" domain={[0, 100]} stroke="#a1a1aa" />
                <YAxis type="number" dataKey="y" name="Delivery" domain={[0, 100]} stroke="#a1a1aa" />
                <ReferenceLine x={50} stroke="#52525b" strokeDasharray="4 4" />
                <ReferenceLine y={50} stroke="#52525b" strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8 }}
                />
                <Scatter
                  name="Developers"
                  data={quadrantQuery.data?.points ?? []}
                  fill="#818cf8"
                  shape={(props: {
                    cx?: number;
                    cy?: number;
                    payload?: { userId?: string };
                  }) => {
                    const { cx = 0, cy = 0, payload } = props;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={8}
                        fill="#818cf8"
                        stroke="#c7d2fe"
                        strokeWidth={1}
                        className="cursor-pointer outline-none transition hover:fill-indigo-400"
                        tabIndex={0}
                        onClick={() => payload?.userId && setSelectedUserId(payload.userId)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && payload?.userId) setSelectedUserId(payload.userId);
                        }}
                      />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="border-zinc-800 bg-zinc-950/50 p-4">
          <h2 className="mb-3 text-lg font-medium text-zinc-100">Period trend slices</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Comparative windows derived from your selected range; each cell is the team average score for that slice.
          </p>
          <ul className="max-h-[360px] space-y-2 overflow-y-auto text-sm text-zinc-300">
            {(trendsQuery.data?.series ?? []).map((s) => (
              <li
                key={s.key}
                className="flex items-center justify-between rounded border border-zinc-800/80 bg-zinc-900/40 px-3 py-2"
              >
                <span className="text-zinc-400">{s.label}</span>
                <span className="font-mono text-zinc-100">{s.points[0]?.value?.toFixed?.(1) ?? "—"}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="overflow-hidden border-zinc-800 bg-zinc-950/50">
        <div className="border-b border-zinc-800 px-4 py-3">
          <h2 className="text-lg font-medium text-zinc-100">Team table</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm text-zinc-300">
            <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3">AI adoption</th>
                <th className="px-4 py-3">Tasks</th>
                <th className="px-4 py-3">Points</th>
                <th className="px-4 py-3">Band</th>
              </tr>
            </thead>
            <tbody>
              {(tableQuery.data?.rows ?? []).map((r) => (
                <tr
                  key={r.userId}
                  className="cursor-pointer border-t border-zinc-800/80 hover:bg-zinc-900/60"
                  onClick={() => setSelectedUserId(r.userId)}
                >
                  <td className="px-4 py-2.5 font-medium text-zinc-100">{r.displayName}</td>
                  <td className="px-4 py-2.5">{r.deliveryScore}</td>
                  <td className="px-4 py-2.5">{r.aiAdoptionScore}</td>
                  <td className="px-4 py-2.5">{r.tasksCompleted}</td>
                  <td className="px-4 py-2.5">{r.storyPointsCompleted}</td>
                  <td className="px-4 py-2.5 text-indigo-300">{r.band.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2 border-t border-zinc-800 px-4 py-3">
          <a
            href={`/api/reports/developer-effectiveness/export?${filtersKey}&format=csv`}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
          >
            Export CSV
          </a>
          <a
            href={`/api/reports/developer-effectiveness/export?${filtersKey}&format=xlsx`}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-700"
          >
            Export Excel
          </a>
        </div>
      </Card>

      <DeveloperEffectivenessUserDetailDrawer
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
        isLoading={userDetailQuery.isLoading}
        data={userDetailQuery.data}
      />
    </div>
  );
}
