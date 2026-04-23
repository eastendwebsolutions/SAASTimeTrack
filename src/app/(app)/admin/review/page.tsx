import { and, eq, inArray } from "drizzle-orm";
import { AuditTrailTable } from "@/components/audit/audit-trail-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { adminNotifications, companies, entryComments, timeEntries, timesheets, users } from "@/lib/db/schema";
import { SuperAdminReviewPanel } from "@/components/admin/super-admin-review-panel";
import { listAuditChanges } from "@/lib/services/audit-log";
import { getClerkAccessStatus } from "@/lib/services/clerk-admin";
import { getWeekBounds } from "@/lib/services/week";

type SearchParams = Promise<{ adminAuditPage?: string }>;

export default async function AdminReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getOrCreateCurrentUser();
  if (!user || !canReviewEntries(user.role)) {
    return <p className="text-zinc-400">Admin access required.</p>;
  }
  const params = await searchParams;
  const adminAuditPage = Math.max(1, Number(params.adminAuditPage ?? "1") || 1);
  const audit = await listAuditChanges({
    companyId: user.companyId,
    pageKey: "admin_review",
    page: adminAuditPage,
    pageSize: 10,
  });

  const entries = await db.query.timeEntries.findMany({
    where: isSuperAdmin(user.role)
      ? eq(timeEntries.status, "submitted")
      : and(eq(timeEntries.companyId, user.companyId), eq(timeEntries.status, "submitted")),
    orderBy: (table, { desc }) => [desc(table.entryDate)],
  });
  const comments = entries.length
    ? await db.query.entryComments.findMany({
        where: inArray(
          entryComments.timeEntryId,
          entries.map((entry) => entry.id),
        ),
        orderBy: (table, { asc }) => [asc(table.createdAt)],
      })
    : [];
  const authorIds = [...new Set(comments.map((comment) => comment.authorUserId))];
  const authors = authorIds.length
    ? await db.query.users.findMany({
        where: inArray(users.id, authorIds),
      })
    : [];
  const authorMap = new Map(authors.map((author) => [author.id, author.email]));
  const notifications = isSuperAdmin(user.role)
    ? await db.query.adminNotifications.findMany({
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      })
    : await db.query.adminNotifications.findMany({
        where: and(eq(adminNotifications.companyId, user.companyId), eq(adminNotifications.recipientUserId, user.id)),
        orderBy: (table, { desc }) => [desc(table.createdAt)],
      });
  const submittedSheets = await db.query.timesheets.findMany({
    where: isSuperAdmin(user.role)
      ? eq(timesheets.status, "submitted")
      : and(eq(timesheets.companyId, user.companyId), inArray(timesheets.status, ["submitted", "draft"])),
    orderBy: (table, { desc }) => [desc(table.submittedAt)],
  });

  if (isSuperAdmin(user.role)) {
    const allUsers = await db.query.users.findMany({
      orderBy: (table, { asc }) => [asc(table.email)],
    });
    const allUserStatuses = await Promise.all(
      allUsers.map(async (row) => {
        try {
          return await getClerkAccessStatus(row.clerkUserId);
        } catch {
          return {
            clerkUserId: row.clerkUserId,
            isAccessRevoked: false,
            lastLoginAt: null,
            isActiveNow: false,
          };
        }
      }),
    );
    const statusByClerkUserId = new Map(allUserStatuses.map((status) => [status.clerkUserId, status]));
    const allCompanies = await db.query.companies.findMany({
      orderBy: (table, { asc }) => [asc(table.name)],
    });
    const allWorkspaceAdmins = await db.query.ppWorkspaceAdmins.findMany();
    const allProjects = await db.query.projects.findMany({
      orderBy: (table, { asc }) => [asc(table.name)],
    });
    const draftEntries = await db.query.timeEntries.findMany({
      where: eq(timeEntries.status, "draft"),
      orderBy: (table, { asc }) => [asc(table.timeIn)],
    });
    const draftSheetMap = new Map<string, { companyId: string; userId: string; weekStart: Date }>();
    for (const entry of draftEntries) {
      const bounds = getWeekBounds(new Date(entry.entryDate));
      const key = `${entry.userId}:${bounds.start.toISOString()}`;
      if (!draftSheetMap.has(key)) {
        draftSheetMap.set(key, { companyId: entry.companyId, userId: entry.userId, weekStart: bounds.start });
      }
    }
    const draftSheets = [...draftSheetMap.entries()].map(([key, value]) => ({
      id: `draft:${key}`,
      companyId: value.companyId,
      userId: value.userId,
      status: "draft",
      weekStart: value.weekStart,
      submittedAt: null,
      submittedFromIp: null,
    }));

    const sheetIds = submittedSheets.map((sheet) => sheet.id);
    const sheetEntries = [
      ...(sheetIds.length
        ? await db.query.timeEntries.findMany({
            where: inArray(timeEntries.timesheetId, sheetIds),
            orderBy: (table, { asc }) => [asc(table.timeIn)],
          })
        : []),
      ...draftEntries,
    ];
    const reviewSheets = [...submittedSheets, ...draftSheets];

    return (
      <div className="space-y-6">
        <SuperAdminReviewPanel
          users={allUsers.map((row) => ({
            id: row.id,
            clerkUserId: row.clerkUserId,
            email: row.email,
            role: row.role,
            companyId: row.companyId,
            lastLoginAt: statusByClerkUserId.get(row.clerkUserId)?.lastLoginAt ?? null,
            isActiveNow: statusByClerkUserId.get(row.clerkUserId)?.isActiveNow ?? false,
            isAccessRevoked: statusByClerkUserId.get(row.clerkUserId)?.isAccessRevoked ?? false,
          }))}
          companies={allCompanies.map((row) => ({
            id: row.id,
            name: row.name,
            asanaWorkspaceId: row.asanaWorkspaceId,
          }))}
          workspaceAdmins={allWorkspaceAdmins.map((row) => ({
            userId: row.userId,
            asanaWorkspaceId: row.asanaWorkspaceId,
          }))}
          projects={allProjects.map((row) => ({
            id: row.id,
            name: row.name,
          }))}
          entries={sheetEntries.map((row) => {
            const draftKey = row.timesheetId
              ? null
              : `draft:${row.userId}:${getWeekBounds(new Date(row.entryDate)).start.toISOString()}`;
            return {
              id: row.id,
              timesheetId: row.timesheetId ?? draftKey,
              projectId: row.projectId,
              summary: row.summary,
              timeIn: row.timeIn.toISOString(),
              timeOut: row.timeOut.toISOString(),
              durationMinutes: row.durationMinutes,
              status: row.status,
            };
          })}
          submittedSheets={reviewSheets.map((row) => ({
            id: row.id,
            companyId: row.companyId,
            userId: row.userId,
            status: row.status,
            weekStart: row.weekStart.toISOString(),
            submittedAt: row.submittedAt?.toISOString() ?? null,
            submittedFromIp: row.submittedFromIp ?? null,
          }))}
        />
        <AuditTrailTable
          rows={audit.rows}
          page={audit.page}
          totalPages={audit.totalPages}
          pageParam="adminAuditPage"
          basePath="/admin/review"
        />
      </div>
    );
  }

  const companyDraftEntries = await db.query.timeEntries.findMany({
    where: and(eq(timeEntries.companyId, user.companyId), eq(timeEntries.status, "draft")),
    orderBy: (table, { asc }) => [asc(table.timeIn)],
  });
  const companyDraftSheetMap = new Map<string, { companyId: string; userId: string; weekStart: Date }>();
  for (const entry of companyDraftEntries) {
    const bounds = getWeekBounds(new Date(entry.entryDate));
    const key = `${entry.userId}:${bounds.start.toISOString()}`;
    if (!companyDraftSheetMap.has(key)) {
      companyDraftSheetMap.set(key, { companyId: entry.companyId, userId: entry.userId, weekStart: bounds.start });
    }
  }
  const companyDraftSheets = [...companyDraftSheetMap.entries()].map(([key, value]) => ({
    id: `draft:${key}`,
    companyId: value.companyId,
    userId: value.userId,
    status: "draft",
    weekStart: value.weekStart,
    submittedAt: null,
    submittedFromIp: null,
  }));
  const reviewSheets = [...submittedSheets, ...companyDraftSheets];
  const actorCompany = await db.query.companies.findFirst({
    where: eq(companies.id, user.companyId),
    columns: { id: true, asanaWorkspaceId: true },
  });
  const workspaceCompanyIds =
    actorCompany?.asanaWorkspaceId
      ? (
          await db.query.companies.findMany({
            where: eq(companies.asanaWorkspaceId, actorCompany.asanaWorkspaceId),
            columns: { id: true },
          })
        ).map((row) => row.id)
      : [user.companyId];
  const companyUsers = await db.query.users.findMany({
    where: inArray(users.companyId, workspaceCompanyIds),
    orderBy: (table, { asc }) => [asc(table.email)],
  });
  const companyUserStatuses = await Promise.all(
    companyUsers.map(async (row) => {
      try {
        return await getClerkAccessStatus(row.clerkUserId);
      } catch {
        return {
          clerkUserId: row.clerkUserId,
          isAccessRevoked: false,
          lastLoginAt: null,
          isActiveNow: false,
        };
      }
    }),
  );
  const statusByClerkUserId = new Map(companyUserStatuses.map((status) => [status.clerkUserId, status]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin Review</h1>
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Workspace Users</h2>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Access</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {companyUsers.map((companyUser) => {
                const status = statusByClerkUserId.get(companyUser.clerkUserId);
                const isRevoked = status?.isAccessRevoked ?? false;
                const isActiveNow = status?.isActiveNow ?? false;
                return (
                  <tr key={companyUser.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3">{companyUser.email}</td>
                    <td className="px-4 py-3 capitalize">{companyUser.role}</td>
                    <td className="px-4 py-3">
                      {status?.lastLoginAt ? new Date(status.lastLoginAt).toLocaleString("en-US") : "Never"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={isActiveNow ? "text-emerald-400" : "text-rose-400"}>
                        {isActiveNow ? "Active" : "Offline"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={isRevoked ? "text-rose-400" : "text-emerald-400"}>
                        {isRevoked ? "Revoked" : "Enabled"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {companyUser.role === "super_admin" ? (
                        <span className="text-xs text-zinc-500">Managed by Super Admin</span>
                      ) : !isRevoked ? (
                        <div className="flex items-center gap-2">
                          <form action={`/api/admin/users/${companyUser.id}/role`} method="post">
                            <input
                              type="hidden"
                              name="role"
                              value={companyUser.role === "company_admin" ? "user" : "company_admin"}
                            />
                            <Button type="submit" variant={companyUser.role === "company_admin" ? "secondary" : "primary"}>
                              {companyUser.role === "company_admin" ? "Revoke Company Admin" : "Make Company Admin"}
                            </Button>
                          </form>
                          <form action={`/api/admin/users/${companyUser.id}/access`} method="post">
                            <input type="hidden" name="enabled" value="0" />
                            <Button type="submit" variant="danger">
                              Revoke Access
                            </Button>
                          </form>
                        </div>
                      ) : (
                        <form action={`/api/admin/users/${companyUser.id}/access`} method="post">
                          <input type="hidden" name="enabled" value="1" />
                          <Button type="submit" variant="secondary">
                            Restore Access
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Notifications</h2>
        {notifications.length === 0 ? <p className="text-sm text-zinc-500">No notifications.</p> : null}
        {notifications.slice(0, 8).map((notification) => (
          <Card key={notification.id} className="p-3 text-sm text-zinc-300">
            <p className="font-medium text-zinc-100">{notification.title}</p>
            <p>{notification.body}</p>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Submitted + Unsubmitted Timesheets</h2>
        {reviewSheets.length === 0 ? <p className="text-sm text-zinc-500">No submitted timesheets pending.</p> : null}
        {reviewSheets.map((sheet) => (
          <Card key={sheet.id} className="p-4">
            <p className="text-sm text-zinc-300">
              Week of {new Date(sheet.weekStart).toLocaleDateString("en-US")} | Status:{" "}
              <span className="capitalize">{sheet.status === "submitted" ? "Submitted" : "Unsubmitted"}</span>
              {sheet.submittedAt
                ? ` | Submitted on ${sheet.submittedAt.toLocaleString("en-US")} from ${sheet.submittedFromIp ?? "unknown"}`
                : ""}
            </p>
            <div className="mt-3 flex gap-2">
              <a href={`/admin/timesheet-detail?userId=${sheet.userId}&weekStart=${new Date(sheet.weekStart).toISOString()}`}>
                <Button type="button" variant="secondary">
                  Open Full Timesheet
                </Button>
              </a>
              {sheet.status === "submitted" ? (
                <form action={`/api/timesheets/by-id/${sheet.id}/approve`} method="post">
                  <Button type="submit">Approve Timesheet</Button>
                </form>
              ) : null}
            </div>
          </Card>
        ))}
      </div>

      <h1 className="text-2xl font-semibold">Entry Approval Queue</h1>
      <div className="grid gap-4">
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
                    <p className="mt-1 text-zinc-500">{authorMap.get(comment.authorUserId) ?? "Unknown user"}</p>
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
      <AuditTrailTable
        rows={audit.rows}
        page={audit.page}
        totalPages={audit.totalPages}
        pageParam="adminAuditPage"
        basePath="/admin/review"
      />
    </div>
  );
}
