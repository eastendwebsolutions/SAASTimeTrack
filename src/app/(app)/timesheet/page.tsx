import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import { eachDayOfInterval, format } from "date-fns";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { projects, timeEntries, timesheets } from "@/lib/db/schema";
import { getWeekBounds } from "@/lib/services/week";
import { TimesheetClient } from "@/components/timesheet/timesheet-client";

export default async function TimesheetPage() {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const { start, end } = getWeekBounds(new Date());
  const entries = await db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.userId, user.id),
      gte(timeEntries.entryDate, start),
      lte(timeEntries.entryDate, end),
    ),
    orderBy: (table, { desc }) => [desc(table.entryDate)],
  });
  const entryProjectIds = [...new Set(entries.map((e) => e.projectId))];
  const projectOptions = await db.query.projects.findMany({
    where: and(
      eq(projects.companyId, user.companyId),
      eq(projects.syncedByUserId, user.id),
      entryProjectIds.length > 0
        ? or(eq(projects.isActive, true), inArray(projects.id, entryProjectIds))
        : eq(projects.isActive, true),
    ),
    columns: { id: true, name: true },
    orderBy: (table, { asc }) => [asc(table.name)],
  });
  const currentSheet = await db.query.timesheets.findFirst({
    where: and(eq(timesheets.userId, user.id), eq(timesheets.weekStart, start)),
  });
  const weekDates = eachDayOfInterval({ start, end });
  const isSubmitted = currentSheet?.status === "submitted" || currentSheet?.status === "approved";
  const submittedMessage = currentSheet?.submittedAt
    ? `Timesheet has been submitted on ${currentSheet.submittedAt.toLocaleString("en-US")} from ${currentSheet.submittedFromIp ?? "unknown"}.`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Weekly Timesheet</h1>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/timesheet" className="text-indigo-300">
              Current Week
            </Link>
            <Link href="/timesheet/archive" className="text-zinc-400 hover:text-zinc-200">
              Archive
            </Link>
          </div>
        </div>
        {!isSubmitted ? (
          <form action={`/api/timesheets/${format(start, "yyyy-MM-dd")}/submit`} method="post">
            <Button type="submit">Submit Week</Button>
          </form>
        ) : (
          <Button type="button" variant="secondary" disabled>
            {currentSheet?.status === "approved" ? "Approved" : "Submitted"}
          </Button>
        )}
      </div>
      {submittedMessage ? (
        <Card className="p-4 text-sm text-zinc-300">
          {submittedMessage}
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        <div className="p-4">
          <TimesheetClient entries={entries} weekDates={weekDates} projectOptions={projectOptions} timezone={user.timezone ?? "UTC"} />
        </div>
      </Card>
    </div>
  );
}
