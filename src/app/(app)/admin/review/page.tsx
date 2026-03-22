import { and, eq, inArray } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { adminNotifications, entryComments, timeEntries, timesheets, users } from "@/lib/db/schema";
import { SuperAdminReviewPanel } from "@/components/admin/super-admin-review-panel";
import { getWeekBounds } from "@/lib/services/week";

export default async function AdminReviewPage() {
  const user = await getOrCreateCurrentUser();
  if (!user || !canReviewEntries(user.role)) {
    return <p className="text-zinc-400">Admin access required.</p>;
  }

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
    const allCompanies = await db.query.companies.findMany({
      orderBy: (table, { asc }) => [asc(table.name)],
    });
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
      <SuperAdminReviewPanel
        users={allUsers.map((row) => ({
          id: row.id,
          email: row.email,
          role: row.role,
          companyId: row.companyId,
        }))}
        companies={allCompanies.map((row) => ({
          id: row.id,
          name: row.name,
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin Review</h1>
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
    </div>
  );
}
