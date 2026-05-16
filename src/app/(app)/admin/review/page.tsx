import { Suspense } from "react";
import { and, eq, inArray } from "drizzle-orm";
import { AdminReviewNoticeBanner } from "@/components/admin/admin-review-notice-banner";
import { AdminReviewTabs } from "@/components/admin/admin-review-tabs";
import { AuditTrailTable } from "@/components/audit/audit-trail-table";
import { CompanyAdminReviewPanel } from "@/components/admin/company-admin-review-panel";
import {
  SuperAdminTimesheetsSection,
  SuperAdminUsersSection,
} from "@/components/admin/super-admin-review-panel";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { parseAdminReviewNotice } from "@/lib/admin/review-notice";
import { db } from "@/lib/db";
import { adminNotifications, companies, entryComments, timeEntries, timesheets, users } from "@/lib/db/schema";
import { listAuditChanges } from "@/lib/services/audit-log";
import { getClerkAccessStatus } from "@/lib/services/clerk-admin";
import { getWeekBounds } from "@/lib/services/week";

type SearchParams = Promise<{ adminAuditPage?: string; notice?: string; noticeType?: string }>;

export default async function AdminReviewPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getOrCreateCurrentUser();
  if (!user || !canReviewEntries(user.role)) {
    return <p className="text-zinc-400">Admin access required.</p>;
  }
  const params = await searchParams;
  const adminAuditPage = Math.max(1, Number(params.adminAuditPage ?? "1") || 1);
  const notice = parseAdminReviewNotice(params);

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
        columns: { id: true, email: true },
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
      columns: {
        id: true,
        clerkUserId: true,
        email: true,
        role: true,
        companyId: true,
      },
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
      columns: { id: true, name: true, asanaWorkspaceId: true },
      orderBy: (table, { asc }) => [asc(table.name)],
    });
    const audit = await listAuditChanges({
      companyIds: allCompanies.map((row) => row.id),
      pageKey: "admin_review",
      page: adminAuditPage,
      pageSize: 10,
    });
    const allWorkspaceAdmins = await db.query.ppWorkspaceAdmins.findMany();
    const allProjects = await db.query.projects.findMany({
      columns: { id: true, name: true },
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

    const superAdminUsers = allUsers.map((row) => ({
      id: row.id,
      clerkUserId: row.clerkUserId,
      email: row.email,
      role: row.role,
      companyId: row.companyId,
      lastLoginAt: statusByClerkUserId.get(row.clerkUserId)?.lastLoginAt ?? null,
      isActiveNow: row.id === user.id ? true : (statusByClerkUserId.get(row.clerkUserId)?.isActiveNow ?? false),
      isAccessRevoked: statusByClerkUserId.get(row.clerkUserId)?.isAccessRevoked ?? false,
    }));
    const superAdminCompanies = allCompanies.map((row) => ({
      id: row.id,
      name: row.name,
      asanaWorkspaceId: row.asanaWorkspaceId,
    }));

    return (
      <div className="space-y-6">
        {notice ? <AdminReviewNoticeBanner type={notice.type} message={notice.message} /> : null}
        <Suspense fallback={<p className="text-zinc-400">Loading admin…</p>}>
          <AdminReviewTabs
            title="Admin"
            defaultTab="users"
            tabs={[
              { id: "users", label: "Users & permissions", count: superAdminUsers.length },
              { id: "timesheets", label: "Timesheets", count: reviewSheets.length },
              { id: "audit", label: "Audit trail", count: audit.total || undefined },
            ]}
            panels={{
              users: (
                <SuperAdminUsersSection
                  users={superAdminUsers}
                  companies={superAdminCompanies}
                  workspaceAdmins={allWorkspaceAdmins.map((row) => ({
                    userId: row.userId,
                    asanaWorkspaceId: row.asanaWorkspaceId,
                  }))}
                />
              ),
              timesheets: (
                <SuperAdminTimesheetsSection
                  users={superAdminUsers}
                  companies={superAdminCompanies}
                  projects={allProjects.map((row) => ({ id: row.id, name: row.name }))}
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
              ),
              audit: (
                <AuditTrailTable
                  rows={audit.rows}
                  page={audit.page}
                  totalPages={audit.totalPages}
                  pageParam="adminAuditPage"
                  basePath="/admin/review"
                  query={{ tab: "audit" }}
                />
              ),
            }}
          />
        </Suspense>
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
    columns: {
      id: true,
      clerkUserId: true,
      email: true,
      role: true,
      companyId: true,
    },
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
  const audit = await listAuditChanges({
    companyIds: workspaceCompanyIds,
    pageKey: "admin_review",
    page: adminAuditPage,
    pageSize: 10,
  });

  return (
    <div className="space-y-6">
      {notice ? <AdminReviewNoticeBanner type={notice.type} message={notice.message} /> : null}
      <Suspense fallback={<p className="text-zinc-400">Loading admin…</p>}>
        <CompanyAdminReviewPanel
          currentUserId={user.id}
          companyUsers={companyUsers.map((companyUser) => {
            const status = statusByClerkUserId.get(companyUser.clerkUserId);
            return {
              id: companyUser.id,
              clerkUserId: companyUser.clerkUserId,
              email: companyUser.email,
              role: companyUser.role,
              companyId: companyUser.companyId,
              lastLoginAt: status?.lastLoginAt ?? null,
              isActiveNow: companyUser.id === user.id ? true : (status?.isActiveNow ?? false),
              isAccessRevoked: status?.isAccessRevoked ?? false,
            };
          })}
          notifications={notifications.map((notification) => ({
            id: notification.id,
            title: notification.title,
            body: notification.body,
          }))}
          reviewSheets={reviewSheets.map((sheet) => ({
            id: sheet.id,
            userId: sheet.userId,
            status: sheet.status,
            weekStart: sheet.weekStart.toISOString(),
            submittedAt: sheet.submittedAt?.toISOString() ?? null,
            submittedFromIp: sheet.submittedFromIp ?? null,
          }))}
          entries={entries.map((entry) => ({
            id: entry.id,
            summary: entry.summary,
            durationMinutes: entry.durationMinutes,
          }))}
          comments={comments.map((comment) => ({
            id: comment.id,
            timeEntryId: comment.timeEntryId,
            body: comment.body,
            authorUserId: comment.authorUserId,
          }))}
          authorMap={Object.fromEntries(authorMap)}
          audit={{
            rows: audit.rows,
            page: audit.page,
            totalPages: audit.totalPages,
          }}
        />
      </Suspense>
    </div>
  );
}
