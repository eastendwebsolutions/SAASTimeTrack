import { and, eq, gte, lte, sum } from "drizzle-orm";
import { endOfDay, startOfDay, subDays, subWeeks } from "date-fns";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { getWeekBounds } from "@/lib/services/week";

async function sumMinutesForUserInRange(userId: string, start: Date, end: Date) {
  const [row] = await db
    .select({ total: sum(timeEntries.durationMinutes) })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), gte(timeEntries.entryDate, start), lte(timeEntries.entryDate, end)));
  const raw = row?.total;
  return Number(raw ?? 0);
}

export async function getDashboardTimeSummary(userId: string) {
  const now = new Date();
  const yesterday = subDays(now, 1);
  const yesterdayStart = startOfDay(yesterday);
  const yesterdayEnd = endOfDay(yesterday);

  const currentWeek = getWeekBounds(now);
  const previousWeekAnchor = subWeeks(currentWeek.start, 1);
  const previousWeek = getWeekBounds(previousWeekAnchor);

  const [yesterdayMinutes, currentWeekMinutes, previousWeekMinutes] = await Promise.all([
    sumMinutesForUserInRange(userId, yesterdayStart, yesterdayEnd),
    sumMinutesForUserInRange(userId, currentWeek.start, currentWeek.end),
    sumMinutesForUserInRange(userId, previousWeek.start, previousWeek.end),
  ]);

  return {
    yesterdayMinutes,
    currentWeekMinutes,
    previousWeekMinutes,
    labels: {
      yesterday: yesterdayStart.toISOString().slice(0, 10),
      currentWeekStart: currentWeek.start.toISOString().slice(0, 10),
      previousWeekStart: previousWeek.start.toISOString().slice(0, 10),
    },
  };
}

export function formatHoursFromMinutes(minutes: number) {
  if (!minutes) return "0 h";
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded} h`;
}
