import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { getOrCreateCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const entries = await db.query.timeEntries.findMany({ where: eq(timeEntries.userId, user.id) });

  const csv = stringify(
    entries.map((entry) => ({
      date: entry.entryDate.toISOString(),
      summary: entry.summary,
      durationMinutes: entry.durationMinutes,
      status: entry.status,
    })),
    { header: true },
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=timesheet.csv",
    },
  });
}
