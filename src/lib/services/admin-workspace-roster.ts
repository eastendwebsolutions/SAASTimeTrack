import { and, asc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import { canReviewEntries } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { asanaConnections, teamStatusEvents, timeEntries, users } from "@/lib/db/schema";
import { resolveWorkspaceCompanyIdsForCompanyAdmin, type AdminWorkspaceActor } from "@/lib/services/admin-workspace-scope";
import {
  evaluateDayStatus,
  getNowInNy,
  nyDateKeyToTimestamp,
  TEAM_STATUS_TIMEZONE,
  type TeamStatus,
  type TeamStatusEventType,
} from "@/lib/services/team-status";

export type WorkspaceRosterMember = {
  userId: string;
  email: string;
  displayName: string;
  initials: string;
  role: string;
  status: TeamStatus;
  lastEventType: TeamStatusEventType | null;
  lastEventTimeLocalLabel: string | null;
  activeWorkSeconds: number;
  loggedMinutesToday: number;
};

function displayNameFromEmail(email: string) {
  const raw = email.split("@")[0] ?? email;
  return raw
    .split(/[._-]+/g)
    .filter(Boolean)
    .map((token) => `${token.charAt(0).toUpperCase()}${token.slice(1)}`)
    .join(" ");
}

function initialsFromName(name: string) {
  const parts = name.split(" ").filter(Boolean);
  return (parts[0]?.[0] ?? "").concat(parts[1]?.[0] ?? "").toUpperCase() || "U";
}

const STATUS_SORT_ORDER: Record<TeamStatus, number> = {
  Working: 0,
  "On Break": 1,
  "Needs Review": 2,
  "Not Started": 3,
  "Ended Day": 4,
};

export async function getWorkspaceRosterForCompanyAdmin(actor: AdminWorkspaceActor) {
  if (!canReviewEntries(actor.role) || actor.role !== "company_admin") {
    throw new Error("Company admin access required");
  }

  const companyIds = await resolveWorkspaceCompanyIdsForCompanyAdmin(actor.companyId);
  if (companyIds.length === 0) {
    const todayKey = getNowInNy().dateKey;
    return {
      dateKey: todayKey,
      timezone: TEAM_STATUS_TIMEZONE,
      memberCount: 0,
      members: [],
    };
  }

  const todayKey = getNowInNy().dateKey;
  const todayStart = nyDateKeyToTimestamp(todayKey);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  const workspaceUsers = await db
    .selectDistinct({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .innerJoin(asanaConnections, eq(asanaConnections.userId, users.id))
    .where(
      and(
        inArray(users.companyId, companyIds),
        or(eq(users.companyId, actor.companyId), ne(users.role, "super_admin")),
      ),
    )
    .orderBy(asc(users.email));

  const [statusEvents, loggedRows] = await Promise.all([
    db.query.teamStatusEvents.findMany({
      where: and(inArray(teamStatusEvents.companyId, companyIds), eq(teamStatusEvents.eventLocalDate, todayStart)),
      orderBy: [asc(teamStatusEvents.eventTimestampUtc)],
    }),
    db
      .select({
        userId: timeEntries.userId,
        totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`.mapWith(Number),
      })
      .from(timeEntries)
      .where(
        and(
          inArray(timeEntries.companyId, companyIds),
          gte(timeEntries.entryDate, todayStart),
          lt(timeEntries.entryDate, tomorrowStart),
        ),
      )
      .groupBy(timeEntries.userId),
  ]);

  const eventsByUser = new Map<string, typeof statusEvents>();
  for (const event of statusEvents) {
    const list = eventsByUser.get(event.userId) ?? [];
    list.push(event);
    eventsByUser.set(event.userId, list);
  }

  const loggedByUser = new Map(loggedRows.map((row) => [row.userId, row.totalMinutes]));
  const now = new Date();

  const members: WorkspaceRosterMember[] = workspaceUsers.map((row) => {
    const displayName = row.displayName?.trim() || displayNameFromEmail(row.email);
    const evaluation = evaluateDayStatus(eventsByUser.get(row.id) ?? [], now);
    return {
      userId: row.id,
      email: row.email,
      displayName,
      initials: initialsFromName(displayName),
      role: row.role,
      status: evaluation.status,
      lastEventType: evaluation.lastEventType,
      lastEventTimeLocalLabel: evaluation.lastEventTimeLocalLabel,
      activeWorkSeconds: evaluation.activeWorkSeconds,
      loggedMinutesToday: loggedByUser.get(row.id) ?? 0,
    };
  });

  members.sort((left, right) => {
    const statusDelta = STATUS_SORT_ORDER[left.status] - STATUS_SORT_ORDER[right.status];
    if (statusDelta !== 0) return statusDelta;
    return left.displayName.localeCompare(right.displayName);
  });

  return {
    dateKey: todayKey,
    timezone: TEAM_STATUS_TIMEZONE,
    memberCount: members.length,
    members,
  };
}
