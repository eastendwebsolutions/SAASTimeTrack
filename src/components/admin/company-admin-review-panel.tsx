"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AdminReviewTabs } from "@/components/admin/admin-review-tabs";
import { AdminWorkspaceTeamSidebar } from "@/components/admin/admin-workspace-team-sidebar";
import { AuditTrailTable } from "@/components/audit/audit-trail-table";

type CompanyUserRow = {
  id: string;
  clerkUserId: string;
  email: string;
  role: string;
  companyId: string;
  lastLoginAt: string | null;
  isActiveNow: boolean;
  isAccessRevoked: boolean;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string;
};

type TimesheetRow = {
  id: string;
  userId: string;
  status: string;
  weekStart: string;
  submittedAt: string | null;
  submittedFromIp: string | null;
};

type EntryRow = {
  id: string;
  summary: string;
  durationMinutes: number;
};

type CommentRow = {
  id: string;
  timeEntryId: string;
  body: string;
  authorUserId: string;
};

type AuditRow = {
  id: string;
  userEmail: string;
  createdAt: Date;
  fieldName: string;
  beforeValue: string | null;
  afterValue: string | null;
};

type Props = {
  currentUserId: string;
  companyUsers: CompanyUserRow[];
  notifications: NotificationRow[];
  reviewSheets: TimesheetRow[];
  entries: EntryRow[];
  comments: CommentRow[];
  authorMap: Record<string, string>;
  audit: {
    rows: AuditRow[];
    page: number;
    totalPages: number;
  };
};

export function CompanyAdminReviewPanel({
  currentUserId,
  companyUsers,
  notifications,
  reviewSheets,
  entries,
  comments,
  authorMap,
  audit,
}: Props) {
  const auditQuery = { tab: "audit" };

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1">
        <AdminReviewTabs
      title="Admin Review"
      defaultTab="users"
      tabs={[
        { id: "users", label: "Users & permissions", count: companyUsers.length },
        { id: "timesheets", label: "Timesheets", count: reviewSheets.length },
        { id: "entries", label: "Entry approval", count: entries.length },
        { id: "notifications", label: "Notifications", count: notifications.length },
        { id: "audit", label: "Audit trail", count: audit.rows.length || undefined },
      ]}
      panels={{
        users: (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Grant company admin, or revoke and restore workspace user access.</p>
            <Card className="divide-y divide-zinc-800">
              {companyUsers.map((companyUser) => {
                const isRevoked = companyUser.isAccessRevoked;
                const isActiveNow = companyUser.id === currentUserId ? true : companyUser.isActiveNow;
                return (
                  <article key={companyUser.id} className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-sm font-medium text-zinc-100" title={companyUser.email}>
                          {companyUser.email}
                        </p>
                        <p className="text-xs capitalize text-zinc-400">{companyUser.role.replaceAll("_", " ")}</p>
                      </div>
                      <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1 text-xs sm:text-sm">
                        <div>
                          <dt className="text-zinc-500">Active</dt>
                          <dd className={isActiveNow ? "text-emerald-400" : "text-rose-400"}>{isActiveNow ? "Yes" : "No"}</dd>
                        </div>
                        <div>
                          <dt className="text-zinc-500">Access</dt>
                          <dd className={isRevoked ? "text-rose-400" : "text-emerald-400"}>{isRevoked ? "Revoked" : "OK"}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-zinc-500">Last login</dt>
                          <dd className="break-words text-zinc-200">
                            {companyUser.lastLoginAt
                              ? new Date(companyUser.lastLoginAt).toLocaleString("en-US")
                              : "Never"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                    <div className="mt-4 border-t border-zinc-800/80 pt-4">
                      {companyUser.role === "super_admin" ? (
                        <p className="text-xs text-zinc-500">Managed by Super Admin</p>
                      ) : !isRevoked ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                          <form
                            action={`/api/admin/users/${companyUser.id}/role`}
                            method="post"
                            className="max-w-full sm:inline-block"
                          >
                            <input
                              type="hidden"
                              name="role"
                              value={companyUser.role === "company_admin" ? "user" : "company_admin"}
                            />
                            <Button
                              type="submit"
                              variant={companyUser.role === "company_admin" ? "secondary" : "primary"}
                              className="h-auto w-full max-w-full whitespace-normal py-2 sm:w-auto"
                            >
                              <span className="hidden sm:inline">
                                {companyUser.role === "company_admin" ? "Revoke Company Admin" : "Make Company Admin"}
                              </span>
                              <span className="sm:hidden">
                                {companyUser.role === "company_admin" ? "Revoke admin role" : "Grant company admin"}
                              </span>
                            </Button>
                          </form>
                          <form
                            action={`/api/admin/users/${companyUser.id}/access`}
                            method="post"
                            className="max-w-full sm:inline-block"
                          >
                            <input type="hidden" name="enabled" value="0" />
                            <Button type="submit" variant="danger" className="w-full sm:w-auto">
                              Revoke access
                            </Button>
                          </form>
                        </div>
                      ) : (
                        <form action={`/api/admin/users/${companyUser.id}/access`} method="post" className="max-w-full">
                          <input type="hidden" name="enabled" value="1" />
                          <Button type="submit" variant="secondary" className="w-full sm:w-auto">
                            Restore access
                          </Button>
                        </form>
                      )}
                    </div>
                  </article>
                );
              })}
            </Card>
          </div>
        ),
        timesheets: (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Open or approve submitted and draft timesheets for your workspace.</p>
            {reviewSheets.length === 0 ? <p className="text-sm text-zinc-500">No timesheets pending review.</p> : null}
            {reviewSheets.map((sheet) => (
              <Card key={sheet.id} className="p-4">
                <p className="text-sm text-zinc-300">
                  Week of {new Date(sheet.weekStart).toLocaleDateString("en-US")} | Status:{" "}
                  <span className="capitalize">{sheet.status === "submitted" ? "Submitted" : "Unsubmitted"}</span>
                  {sheet.submittedAt
                    ? ` | Submitted on ${new Date(sheet.submittedAt).toLocaleString("en-US")} from ${sheet.submittedFromIp ?? "unknown"}`
                    : ""}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <a
                    href={`/admin/timesheet-detail?userId=${sheet.userId}&weekStart=${new Date(sheet.weekStart).toISOString()}`}
                    className="sm:inline-block"
                  >
                    <Button type="button" variant="secondary" className="w-full sm:w-auto">
                      Open Full Timesheet
                    </Button>
                  </a>
                  {sheet.status === "submitted" ? (
                    <form action={`/api/timesheets/by-id/${sheet.id}/approve`} method="post" className="sm:inline-block">
                      <Button type="submit" className="w-full sm:w-auto">
                        Approve Timesheet
                      </Button>
                    </form>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        ),
        entries: (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Approve or reject individual submitted time entries and leave comments.</p>
            <div className="grid gap-4">
              {entries.length === 0 ? <p className="text-sm text-zinc-500">No entries awaiting approval.</p> : null}
              {entries.map((entry) => (
                <Card key={entry.id} className="p-4">
                  <div className="mb-3 text-sm text-zinc-300">{entry.summary}</div>
                  <div className="text-xs text-zinc-500">{entry.durationMinutes} minutes</div>
                  <div className="mt-4 space-y-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">Comments</p>
                    {comments
                      .filter((comment) => comment.timeEntryId === entry.id)
                      .map((comment) => (
                        <div key={comment.id} className="rounded border border-zinc-800 bg-zinc-900/70 p-2 text-xs">
                          <p className="text-zinc-200">{comment.body}</p>
                          <p className="mt-1 text-zinc-500">{authorMap[comment.authorUserId] ?? "Unknown user"}</p>
                        </div>
                      ))}
                    <form action={`/api/time-entries/${entry.id}/comments`} method="post" className="flex gap-2">
                      <input
                        type="text"
                        name="body"
                        className="w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-sm"
                        placeholder="Add comment for submitter"
                        required
                      />
                      <Button type="submit" variant="secondary">
                        Comment
                      </Button>
                    </form>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <form action={`/api/time-entries/${entry.id}/approve`} method="post">
                      <Button type="submit">Approve</Button>
                    </form>
                    <form action={`/api/time-entries/${entry.id}/reject`} method="post">
                      <Button type="submit" variant="danger">
                        Reject
                      </Button>
                    </form>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ),
        notifications: (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">Recent admin notifications for your account.</p>
            {notifications.length === 0 ? <p className="text-sm text-zinc-500">No notifications.</p> : null}
            {notifications.slice(0, 8).map((notification) => (
              <Card key={notification.id} className="p-3 text-sm text-zinc-300">
                <p className="font-medium text-zinc-100">{notification.title}</p>
                <p>{notification.body}</p>
              </Card>
            ))}
          </div>
        ),
        audit: (
          <AuditTrailTable
            rows={audit.rows}
            page={audit.page}
            totalPages={audit.totalPages}
            pageParam="adminAuditPage"
            basePath="/admin/review"
            query={auditQuery}
          />
        ),
      }}
        />
      </div>
      <aside className="w-full shrink-0 xl:w-[22rem] xl:sticky xl:top-6 xl:self-start">
        <AdminWorkspaceTeamSidebar />
      </aside>
    </div>
  );
}
