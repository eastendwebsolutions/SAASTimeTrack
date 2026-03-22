import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Card } from "@/components/ui/card";
import { canReviewEntries, isSuperAdmin } from "@/lib/auth/rbac";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { timesheets, users } from "@/lib/db/schema";

export default async function TimesheetArchivePage() {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const archivedSheets = canReviewEntries(user.role)
    ? await db.query.timesheets.findMany({
        where: isSuperAdmin(user.role)
          ? eq(timesheets.status, "approved")
          : and(eq(timesheets.companyId, user.companyId), eq(timesheets.status, "approved")),
        orderBy: (table) => [desc(table.approvedAt)],
      })
    : await db.query.timesheets.findMany({
        where: and(eq(timesheets.userId, user.id), eq(timesheets.status, "approved")),
        orderBy: (table) => [desc(table.approvedAt)],
      });

  const ownerIds = [...new Set(archivedSheets.map((sheet) => sheet.userId))];
  const owners = ownerIds.length
    ? isSuperAdmin(user.role)
      ? await db.query.users.findMany()
      : await db.query.users.findMany({ where: eq(users.companyId, user.companyId) })
    : [];
  const ownerMap = new Map(owners.map((owner) => [owner.id, owner.email]));

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Timesheet Archive</h1>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/timesheet" className="text-zinc-400 hover:text-zinc-200">
            Current Week
          </Link>
          <Link href="/timesheet/archive" className="text-indigo-300">
            Archive
          </Link>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/80 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Week Start</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Approved</th>
              {canReviewEntries(user.role) ? <th className="px-4 py-3">User</th> : null}
            </tr>
          </thead>
          <tbody>
            {archivedSheets.map((sheet) => (
              <tr key={sheet.id} className="border-t border-zinc-800">
                <td className="px-4 py-3">{new Date(sheet.weekStart).toLocaleDateString("en-US")}</td>
                <td className="px-4 py-3">{sheet.submittedAt ? sheet.submittedAt.toLocaleString("en-US") : "-"}</td>
                <td className="px-4 py-3">{sheet.approvedAt ? sheet.approvedAt.toLocaleString("en-US") : "-"}</td>
                {canReviewEntries(user.role) ? (
                  <td className="px-4 py-3">{ownerMap.get(sheet.userId) ?? sheet.userId}</td>
                ) : null}
              </tr>
            ))}
            {archivedSheets.length === 0 ? (
              <tr className="border-t border-zinc-800">
                <td className="px-4 py-3 text-zinc-500" colSpan={canReviewEntries(user.role) ? 4 : 3}>
                  No approved timesheets yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
