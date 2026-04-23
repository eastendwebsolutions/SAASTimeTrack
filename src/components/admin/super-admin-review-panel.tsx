"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type UserRow = {
  id: string;
  email: string;
  role: string;
  companyId: string;
};

type CompanyRow = {
  id: string;
  name: string;
  asanaWorkspaceId: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
};

type EntryRow = {
  id: string;
  timesheetId: string | null;
  projectId: string;
  summary: string;
  timeIn: string;
  timeOut: string;
  durationMinutes: number;
  status: string;
};

type TimesheetRow = {
  id: string;
  companyId: string;
  userId: string;
  status: string;
  weekStart: string;
  submittedAt: string | null;
  submittedFromIp: string | null;
};

type Props = {
  users: UserRow[];
  companies: CompanyRow[];
  workspaceAdmins: Array<{ userId: string; asanaWorkspaceId: string }>;
  projects: ProjectRow[];
  entries: EntryRow[];
  submittedSheets: TimesheetRow[];
};

function formatHms(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const hours = String(Math.floor(safe / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, "0");
  const seconds = String(safe % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

export function SuperAdminReviewPanel({ users, companies, workspaceAdmins, projects, entries, submittedSheets }: Props) {
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");

  const companyMap = useMemo(() => new Map(companies.map((company) => [company.id, company.name])), [companies]);
  const companyWorkspaceMap = useMemo(
    () => new Map(companies.map((company) => [company.id, company.asanaWorkspaceId])),
    [companies],
  );
  const workspaceAdminSet = useMemo(
    () => new Set(workspaceAdmins.map((item) => `${item.userId}:${item.asanaWorkspaceId}`)),
    [workspaceAdmins],
  );
  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);

  const entriesBySheet = useMemo(() => {
    const map = new Map<string, EntryRow[]>();
    for (const entry of entries) {
      if (!entry.timesheetId) continue;
      const current = map.get(entry.timesheetId) ?? [];
      current.push(entry);
      map.set(entry.timesheetId, current);
    }
    return map;
  }, [entries]);

  const filteredSheets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return submittedSheets.filter((sheet) => {
      if (companyFilter !== "all" && sheet.companyId !== companyFilter) return false;
      if (userFilter !== "all" && sheet.userId !== userFilter) return false;

      const sheetEntries = entriesBySheet.get(sheet.id) ?? [];
      if (projectFilter !== "all" && !sheetEntries.some((entry) => entry.projectId === projectFilter)) return false;

      if (!query) return true;
      const email = userMap.get(sheet.userId)?.email?.toLowerCase() ?? "";
      const companyName = companyMap.get(sheet.companyId)?.toLowerCase() ?? "";
      const summaries = sheetEntries.map((entry) => entry.summary.toLowerCase()).join(" ");
      return email.includes(query) || companyName.includes(query) || summaries.includes(query) || sheet.id.includes(query);
    });
  }, [search, submittedSheets, companyFilter, userFilter, projectFilter, entriesBySheet, userMap, companyMap]);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-lg font-medium">All Users (All Companies)</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Workspace Admin</th>
                <th className="px-4 py-3">Poker Planning Admin</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3 capitalize">{user.role}</td>
                  <td className="px-4 py-3">{companyMap.get(user.companyId) ?? user.companyId}</td>
                  <td className="px-4 py-3">
                    {user.role === "super_admin" ? (
                      <span className="text-xs text-zinc-500">Super Admin</span>
                    ) : (
                      <form action={`/api/admin/users/${user.id}/role`} method="post" className="flex items-center gap-2">
                        <input type="hidden" name="role" value={user.role === "company_admin" ? "user" : "company_admin"} />
                        <Button type="submit" variant={user.role === "company_admin" ? "secondary" : "primary"}>
                          {user.role === "company_admin" ? "Revoke Company Admin" : "Make Company Admin"}
                        </Button>
                      </form>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {companyWorkspaceMap.get(user.companyId) ? (
                      (() => {
                        const workspaceId = companyWorkspaceMap.get(user.companyId)!;
                        const enabled = workspaceAdminSet.has(`${user.id}:${workspaceId}`);
                        return (
                          <form action={`/api/admin/users/${user.id}/poker-planning-admin`} method="post" className="flex items-center gap-2">
                            <input type="hidden" name="workspaceId" value={workspaceId} />
                            <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
                            <Button type="submit" variant={enabled ? "secondary" : "primary"}>
                              {enabled ? "Revoke" : "Grant"}
                            </Button>
                            <span className="text-xs text-zinc-500">{enabled ? "Enabled" : "Disabled"}</span>
                          </form>
                        );
                      })()
                    ) : (
                      <span className="text-xs text-zinc-500">Workspace not synced yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Timesheets (Submitted + Unsubmitted)</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm"
            placeholder="Search user/company/summary"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm"
            value={companyFilter}
            onChange={(event) => setCompanyFilter(event.target.value)}
          >
            <option value="all">All Companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm"
            value={userFilter}
            onChange={(event) => setUserFilter(event.target.value)}
          >
            <option value="all">All Users</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.email}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value="all">All Projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {filteredSheets.map((sheet) => {
          const sheetEntries = (entriesBySheet.get(sheet.id) ?? []).sort(
            (left, right) => new Date(left.timeIn).getTime() - new Date(right.timeIn).getTime(),
          );
          const totalSeconds = sheetEntries.reduce((sum, entry) => sum + entry.durationMinutes * 60, 0);

          return (
            <Card key={sheet.id} className="p-4">
              <p className="text-sm text-zinc-200">
                {userMap.get(sheet.userId)?.email ?? sheet.userId} | {companyMap.get(sheet.companyId) ?? sheet.companyId}
              </p>
              <p className="text-xs text-zinc-500">
                Week of {new Date(sheet.weekStart).toLocaleDateString("en-US")} | Status:{" "}
                <span className="capitalize">{sheet.status === "submitted" ? "Submitted" : "Unsubmitted"}</span>
                {sheet.submittedAt
                  ? ` | Submitted: ${new Date(sheet.submittedAt).toLocaleString("en-US")} from ${sheet.submittedFromIp ?? "unknown"}`
                  : ""}
              </p>
              <table className="mt-3 w-full text-sm">
                <thead className="text-left text-zinc-500">
                  <tr>
                    <th className="py-2">Project</th>
                    <th className="py-2">Time In</th>
                    <th className="py-2">Time Out</th>
                    <th className="py-2">Summary</th>
                    <th className="py-2">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {sheetEntries.map((entry) => (
                    <tr key={entry.id} className="border-t border-zinc-800">
                      <td className="py-2">{projectMap.get(entry.projectId) ?? entry.projectId}</td>
                      <td className="py-2">{new Date(entry.timeIn).toLocaleTimeString("en-US")}</td>
                      <td className="py-2">{new Date(entry.timeOut).toLocaleTimeString("en-US")}</td>
                      <td className="py-2">{entry.summary}</td>
                      <td className="py-2 font-mono">{formatHms(entry.durationMinutes * 60)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-zinc-700">
                    <td className="py-2 font-medium text-zinc-100" colSpan={4}>
                      Total
                    </td>
                    <td className="py-2 font-mono font-semibold text-zinc-100">{formatHms(totalSeconds)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 flex gap-2">
                <Link href={`/admin/timesheet-detail?userId=${sheet.userId}&weekStart=${new Date(sheet.weekStart).toISOString()}`}>
                  <Button type="button" variant="secondary">
                    Open Full Timesheet
                  </Button>
                </Link>
                {sheet.status === "submitted" ? (
                  <form action={`/api/timesheets/by-id/${sheet.id}/approve`} method="post">
                    <Button type="submit">Approve Timesheet</Button>
                  </form>
                ) : null}
              </div>
            </Card>
          );
        })}

        {filteredSheets.length === 0 ? (
          <p className="text-sm text-zinc-500">No submitted timesheets match current filters.</p>
        ) : null}
      </div>
    </div>
  );
}
