"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type UserRow = {
  id: string;
  clerkUserId: string;
  email: string;
  role: string;
  companyId: string;
  lastLoginAt: string | null;
  isActiveNow: boolean;
  isAccessRevoked: boolean;
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

function formatRole(role: string) {
  return role.replaceAll("_", " ");
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
        <Card className="divide-y divide-zinc-800">
          {users.map((user) => {
            const companyName = companyMap.get(user.companyId) ?? user.companyId;
            const workspaceId = companyWorkspaceMap.get(user.companyId);
            const pokerEnabled =
              workspaceId != null ? workspaceAdminSet.has(`${user.id}:${workspaceId}`) : false;

            return (
              <article key={user.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-medium text-zinc-100" title={user.email}>
                      {user.email}
                    </p>
                    <p className="text-xs text-zinc-400">
                      <span className="capitalize">{formatRole(user.role)}</span>
                      <span className="text-zinc-600"> · </span>
                      <span className="break-words text-zinc-300">{companyName}</span>
                    </p>
                  </div>
                  <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm">
                    <div>
                      <dt className="text-zinc-500">Active</dt>
                      <dd className={user.isActiveNow ? "text-emerald-400" : "text-rose-400"}>
                        {user.isActiveNow ? "Yes" : "No"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Access</dt>
                      <dd className={user.isAccessRevoked ? "text-rose-400" : "text-emerald-400"}>
                        {user.isAccessRevoked ? "Revoked" : "OK"}
                      </dd>
                    </div>
                    <div className="col-span-2 sm:col-span-2">
                      <dt className="text-zinc-500">Last login</dt>
                      <dd className="break-words text-zinc-200">
                        {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("en-US") : "Never"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="mt-4 grid gap-4 border-t border-zinc-800/80 pt-4 sm:grid-cols-2 xl:grid-cols-3">
                  <section className="min-w-0 space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Workspace admin</h3>
                    {user.role === "super_admin" ? (
                      <p className="text-xs text-zinc-500">Super Admin account</p>
                    ) : (
                      <form action={`/api/admin/users/${user.id}/role`} method="post" className="max-w-full">
                        <input type="hidden" name="role" value={user.role === "company_admin" ? "user" : "company_admin"} />
                        <Button
                          type="submit"
                          variant={user.role === "company_admin" ? "secondary" : "primary"}
                          className="h-auto w-full max-w-full whitespace-normal py-2 sm:w-auto"
                        >
                          <span className="hidden sm:inline">
                            {user.role === "company_admin" ? "Revoke Company Admin" : "Make Company Admin"}
                          </span>
                          <span className="sm:hidden">
                            {user.role === "company_admin" ? "Revoke admin role" : "Grant company admin"}
                          </span>
                        </Button>
                      </form>
                    )}
                  </section>

                  <section className="min-w-0 space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Poker planning</h3>
                    {user.role === "super_admin" ? (
                      <p className="text-xs text-zinc-500">Managed with Super Admin</p>
                    ) : !user.isAccessRevoked && workspaceId ? (
                      <form action={`/api/admin/users/${user.id}/poker-planning-admin`} method="post" className="max-w-full">
                        <input type="hidden" name="workspaceId" value={workspaceId} />
                        <input type="hidden" name="enabled" value={pokerEnabled ? "0" : "1"} />
                        <Button
                          type="submit"
                          variant={pokerEnabled ? "secondary" : "primary"}
                          className="w-full max-w-full sm:w-auto"
                          title={
                            pokerEnabled
                              ? "Remove poker planning admin for this user in this workspace"
                              : "Grant poker planning admin for this user in this workspace"
                          }
                        >
                          {pokerEnabled ? "Revoke" : "Grant"}
                        </Button>
                      </form>
                    ) : !user.isAccessRevoked ? (
                      <p className="text-xs text-zinc-500">Workspace not synced yet</p>
                    ) : (
                      <p className="text-xs text-zinc-500">Access revoked</p>
                    )}
                  </section>

                  <section className="min-w-0 space-y-2 sm:col-span-2 xl:col-span-1">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Account access</h3>
                    {user.role === "super_admin" ? (
                      <p className="text-xs text-zinc-500">Always enabled</p>
                    ) : (
                      <form action={`/api/admin/users/${user.id}/access`} method="post" className="max-w-full">
                        <input type="hidden" name="enabled" value={user.isAccessRevoked ? "1" : "0"} />
                        <Button
                          type="submit"
                          variant={user.isAccessRevoked ? "secondary" : "danger"}
                          className="h-auto w-full max-w-full whitespace-normal py-2 sm:w-auto"
                        >
                          {user.isAccessRevoked ? "Restore access" : "Revoke access"}
                        </Button>
                      </form>
                    )}
                  </section>
                </div>
              </article>
            );
          })}
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Timesheets (Submitted + Unsubmitted)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <Card key={sheet.id} className="min-w-0 p-4">
              <p className="break-words text-sm text-zinc-200">
                {userMap.get(sheet.userId)?.email ?? sheet.userId} | {companyMap.get(sheet.companyId) ?? sheet.companyId}
              </p>
              <p className="break-words text-xs text-zinc-500">
                Week of {new Date(sheet.weekStart).toLocaleDateString("en-US")} | Status:{" "}
                <span className="capitalize">{sheet.status === "submitted" ? "Submitted" : "Unsubmitted"}</span>
                {sheet.submittedAt
                  ? ` | Submitted: ${new Date(sheet.submittedAt).toLocaleString("en-US")} from ${sheet.submittedFromIp ?? "unknown"}`
                  : ""}
              </p>
              <div className="mt-3 space-y-2">
                <div className="hidden text-xs font-medium uppercase tracking-wide text-zinc-500 md:grid md:grid-cols-[minmax(0,1.1fr)_auto_auto_minmax(0,1fr)_auto] md:gap-3 md:px-1">
                  <span>Project</span>
                  <span>In</span>
                  <span>Out</span>
                  <span>Summary</span>
                  <span className="text-right">Hours</span>
                </div>
                {sheetEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="grid grid-cols-1 gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-sm md:grid-cols-[minmax(0,1.1fr)_auto_auto_minmax(0,1fr)_auto] md:items-center md:gap-3"
                  >
                    <div className="min-w-0">
                      <span className="text-zinc-500 md:hidden">Project · </span>
                      <span className="break-words text-zinc-200">
                        {projectMap.get(entry.projectId) ?? entry.projectId}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 md:hidden">In · </span>
                      <span className="font-mono text-zinc-200">{new Date(entry.timeIn).toLocaleTimeString("en-US")}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 md:hidden">Out · </span>
                      <span className="font-mono text-zinc-200">{new Date(entry.timeOut).toLocaleTimeString("en-US")}</span>
                    </div>
                    <div className="min-w-0">
                      <span className="text-zinc-500 md:hidden">Summary · </span>
                      <span className="break-words text-zinc-300">{entry.summary}</span>
                    </div>
                    <div className="font-mono text-zinc-100 md:text-right">{formatHms(entry.durationMinutes * 60)}</div>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-700 pt-3 text-sm">
                  <span className="font-medium text-zinc-100">Total</span>
                  <span className="font-mono font-semibold text-zinc-100">{formatHms(totalSeconds)}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link href={`/admin/timesheet-detail?userId=${sheet.userId}&weekStart=${new Date(sheet.weekStart).toISOString()}`} className="sm:inline-block">
                  <Button type="button" variant="secondary" className="w-full sm:w-auto">
                    Open Full Timesheet
                  </Button>
                </Link>
                {sheet.status === "submitted" ? (
                  <form action={`/api/timesheets/by-id/${sheet.id}/approve`} method="post" className="sm:inline-block">
                    <Button type="submit" className="w-full sm:w-auto">
                      Approve Timesheet
                    </Button>
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
